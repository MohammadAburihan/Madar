import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { SiteBalance, SiteRequest } from './project.models';
import { SiteApiService } from './site-api.service';

export type SiteAction = 'use' | 'return';
export type SiteState = 'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type SiteFailure = 'permission' | 'offline' | 'stock' | 'changed' | 'error';

/** State of one "Materials at site" task: record what a project used, then return what it didn't. */
@Injectable({ providedIn: 'root' })
export class SiteStore {
  private readonly api = inject(SiteApiService);
  private readonly business = inject(BusinessService);

  readonly project = signal<string | null>(null);
  readonly item = signal<string | null>(null);
  readonly balance = signal<SiteBalance | null>(null);
  /** No site warehouse yet: nothing was ever delivered to a project. */
  readonly siteMissing = signal(false);
  readonly useInput = signal('');
  readonly returnInput = signal('');
  readonly returnTo = signal<string | null>(null);
  /** The posting under way or last done. */
  readonly action = signal<SiteAction>('use');
  readonly reference = signal(newReference('USE'));
  readonly draft = signal<string | null>(null);
  readonly state = signal<SiteState>('idle');
  readonly failure = signal<SiteFailure | null>(null);
  readonly result = signal<string | null>(null);
  /** The page after the posting has shown it; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<SiteRequest | null>(null);
  /** What the last recorded use consumed, for the "Usage recorded" step. */
  readonly used = signal<number | null>(null);
  private loads = 0;

  readonly useQty = computed(() => parseNumber(this.useInput()));
  readonly returnQty = computed(() => parseNumber(this.returnInput()));
  /** Only the project's own share of the shared site warehouse can be used or returned. */
  readonly useValid = computed(() => this.withinSite(this.useQty()));
  readonly returnValid = computed(() => this.withinSite(this.returnQty()) && !!this.returnTo());
  readonly target = computed(
    () => this.balance()?.warehouses.find((w) => w.warehouse === this.returnTo()) ?? null,
  );
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));
  /** ERPNext refused the posting in a way that may mean the balance is out of date; reload before trying again. */
  readonly stale = computed(() => ['changed', 'stock', 'error'].includes(this.failure() ?? ''));
  readonly canUse = computed(
    () => !!this.balance() && this.useValid() && !this.busy() && !this.stale(),
  );
  readonly canReturn = computed(
    () => !!this.balance() && this.returnValid() && !this.busy() && !this.stale(),
  );

  start(project: string, item: string): void {
    this.discardLeftover();
    this.project.set(project);
    this.item.set(item);
    this.balance.set(null);
    this.siteMissing.set(false);
    this.useInput.set('');
    this.returnInput.set('');
    this.returnTo.set(null);
    this.used.set(null);
    this.loads++;
    this.reset('use');
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen posting; else start over. */
  resume(project: string, item: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(project, item);
    }
  }

  async load(): Promise<void> {
    // Taken before the first await, so a task started meanwhile makes this load stale.
    const run = ++this.loads;
    const project = this.project();
    const item = this.item();
    const business = await this.business.ensure();
    if (run !== this.loads) {
      return;
    }
    if (!project || !item || !business) {
      throw new Error('No project, item or business');
    }
    const balance = await this.api.balance(project, item, business.name);
    if (run !== this.loads) {
      return;
    }
    if (!balance) {
      this.siteMissing.set(true);
      return;
    }
    this.balance.set(balance);
    if (!this.returnTo() || !balance.warehouses.some((w) => w.warehouse === this.returnTo())) {
      this.returnTo.set(balance.returnTo);
    }
  }

  /** After ERPNext refused a posting: drop its draft and reference, and read the balance again. */
  async reload(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.discardLeftover();
    this.reset(this.action());
    await this.load();
  }

  setUse(input: string): void {
    this.clearFailure();
    this.useInput.set(input);
  }

  setReturn(input: string): void {
    this.clearFailure();
    this.returnInput.set(input);
  }

  setReturnTo(warehouse: string | null): void {
    this.clearFailure();
    this.returnTo.set(warehouse);
  }

  /** Opens the return step: a new posting with its own reference, unless a return is already under way. */
  toReturn(): void {
    if (this.busy() || (this.action() === 'return' && this.state() !== 'confirmed')) {
      return;
    }
    this.discardLeftover();
    this.reset('return');
  }

  /** Opens the use step: a new posting, unless a use is already under way. */
  toUse(): void {
    if (this.busy() || (this.action() === 'use' && this.state() !== 'confirmed')) {
      return;
    }
    this.discardLeftover();
    this.used.set(null);
    this.reset('use');
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post twice.
    if (this.busy() || this.stale()) {
      return;
    }
    const action = this.action();
    const balance = this.balance();
    const project = this.project();
    const valid = action === 'use' ? this.useValid() : this.returnValid();
    if (!balance || !project || !valid) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    const business = await this.business.ensure();
    if (!business) {
      this.state.set('idle');
      return;
    }
    const qty = action === 'use' ? this.useQty() : this.returnQty();
    const request: SiteRequest = {
      reference: this.reference(),
      company: business.name,
      project,
      item: balance.item,
      uom: balance.uom,
      qty: Math.round(qty * 1e6) / 1e6,
      site: balance.site,
      to: action === 'use' ? null : this.returnTo(),
    };
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const entry = await this.api.post(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(entry);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved posting: found shows it; a draft or nothing goes back to the form. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the posting gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const found = await this.api.find(reference);
      if (!current()) {
        return 'pending';
      }
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(found.entry);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(entry: string): void {
    this.result.set(entry);
    if (this.action() === 'use') {
      this.used.set(this.sent()?.qty ?? null);
    }
    this.state.set('confirmed');
    // The site balance moved: the next step loads the new one rather than show the old figures.
    this.loads++;
    this.balance.set(null);
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier posting stands in ERPNext; the balance has moved on and must be reloaded.
      this.draft.set(null);
      this.reference.set(newReference(this.action() === 'use' ? 'USE' : 'RET'));
      this.failure.set('changed');
      this.state.set('failed');
      return;
    }
    const erpnextError = ErpnextError.from(error);
    this.failure.set(
      erpnextError.kind === 'forbidden'
        ? 'permission'
        : erpnextError.kind === 'offline'
          ? 'offline'
          : erpnextError.excType === 'NegativeStockError'
            ? 'stock'
            : 'error',
    );
    this.state.set('failed');
  }

  private withinSite(qty: number): boolean {
    return Number.isFinite(qty) && qty > 0 && qty <= (this.balance()?.atSite ?? 0) + 1e-9;
  }

  private reset(action: SiteAction): void {
    this.action.set(action);
    this.reference.set(newReference(action === 'use' ? 'USE' : 'RET'));
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Only a draft a failed or unresolved posting left behind; a posted one stays. */
  private discardLeftover(): void {
    const draft = this.draft();
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
  }

  private clearFailure(): void {
    // Editing doesn't fix a posting ERPNext refused; only reloading does.
    if (this.state() === 'failed' && !this.stale()) {
      this.state.set('idle');
      this.failure.set(null);
    }
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { SupplyPlan, SupplyRequest } from './project.models';
import { SiteWarehouseMissingError } from './projects-api.service';
import { SupplyApiService } from './supply-api.service';

export type SupplyState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type SupplyFailure = 'permission' | 'offline' | 'stock' | 'changed' | 'error';

/** State of one "Supply a project" task: one item, from a warehouse to the project site. */
@Injectable({ providedIn: 'root' })
export class SupplyStore {
  private readonly api = inject(SupplyApiService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('SUP'));
  readonly project = signal<string | null>(null);
  readonly item = signal<string | null>(null);
  readonly plan = signal<SupplyPlan | null>(null);
  /** The site warehouse is missing and this role can't create it. */
  readonly siteMissing = signal(false);
  readonly from = signal<string | null>(null);
  readonly qtyInput = signal('');
  readonly draft = signal<string | null>(null);
  readonly state = signal<SupplyState>('idle');
  readonly failure = signal<SupplyFailure | null>(null);
  /** The posted transfer's name. */
  readonly result = signal<string | null>(null);
  /** The delivered step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<SupplyRequest | null>(null);

  readonly source = computed(
    () => this.plan()?.sources.find((s) => s.warehouse === this.from()) ?? null,
  );
  readonly qty = computed(() => parseNumber(this.qtyInput()));
  /** More than zero, and no more than the source warehouse holds. */
  readonly qtyValid = computed(
    () =>
      Number.isFinite(this.qty()) &&
      this.qty() > 0 &&
      this.qty() <= (this.source()?.qty ?? 0) + 1e-9,
  );
  /** What stays to buy once this delivery goes, less what is already on order. */
  readonly shortfall = computed(() => {
    const plan = this.plan();
    if (!plan) {
      return 0;
    }
    const sending = this.qtyValid() ? this.qty() : 0;
    const ordered = plan.pendingOrders.reduce((sum, o) => sum + o.qty, 0);
    return Math.max(Math.round((plan.need - sending - ordered) * 1e6) / 1e6, 0);
  });
  readonly ready = computed(
    () => !!this.plan() && !!this.source() && this.qtyValid() && this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the delivery. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  start(project: string, item: string): void {
    const draft = this.draft();
    // Only a draft a failed or unresolved confirmation left behind; a posted delivery stays.
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('SUP'));
    this.project.set(project);
    this.item.set(item);
    this.plan.set(null);
    this.siteMissing.set(false);
    this.from.set(null);
    this.qtyInput.set('');
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen delivery; else start over. */
  resume(project: string, item: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(project, item);
    }
  }

  /** Loads the plan and suggests sending what is needed from the warehouse that holds the most. */
  async load(): Promise<void> {
    const project = this.project();
    const item = this.item();
    const business = await this.business.ensure();
    if (!project || !item || !business) {
      throw new Error('No project, item or business to supply');
    }
    const reference = this.reference();
    let plan: SupplyPlan;
    try {
      plan = await this.api.plan(project, item, business.name);
    } catch (error) {
      if (error instanceof SiteWarehouseMissingError) {
        this.siteMissing.set(true);
        return;
      }
      throw error;
    }
    if (this.reference() !== reference) {
      return;
    }
    this.plan.set(plan);
    const best = plan.sources[0] ?? null;
    this.from.set(best?.warehouse ?? null);
    const suggested = Math.min(plan.need, best?.qty ?? 0);
    this.qtyInput.set(suggested > 0 ? String(suggested) : '');
  }

  setFrom(warehouse: string | null): void {
    this.clearFailure();
    this.from.set(warehouse);
  }

  setQty(input: string): void {
    this.clearFailure();
    this.qtyInput.set(input);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not move the stock twice.
    if (this.busy()) {
      return;
    }
    const plan = this.plan();
    const project = this.project();
    const source = this.source();
    if (!plan || !project || !source || !this.qtyValid()) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    const business = await this.business.ensure();
    if (!business) {
      this.state.set('idle');
      return;
    }
    const request: SupplyRequest = {
      reference: this.reference(),
      company: business.name,
      project,
      item: plan.item,
      uom: plan.uom,
      qty: Math.round(this.qty() * 1e6) / 1e6,
      from: source.warehouse,
      site: plan.site,
      requestRows: plan.requestRows,
    };
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const entry = await this.api.deliver(request, this.draft(), (name) => {
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

  /** After an unresolved confirmation: found shows the delivery, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
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
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier delivery stands in ERPNext; the plan has moved on and must be reloaded.
      this.draft.set(null);
      this.reference.set(newReference('SUP'));
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

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }
}

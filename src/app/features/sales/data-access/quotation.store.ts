import { Injectable, computed, inject, signal } from '@angular/core';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { forgetDeletedDrafts } from '../../../core/tasks/deleted-drafts.service';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { lineRate, mergeLines, validQty } from '../../../core/tasks/prefill-lines';
import {
  PrefillNotice,
  PrefillOpening,
  PrefillUnavailableError,
} from '../../../core/tasks/prefill-entry';
import { PrefillPayloads } from '../../../core/tasks/task-prefill.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { QuotationApiService } from './quotation-api.service';
import { SalesApiService } from './sales-api.service';
import { QuoteLine, QuotationDetail, QuotationRequest, quoteTotal } from './quotation.models';
import { CatalogItem } from './sale.models';

export type QuoteState = 'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type QuoteFailure = 'permission' | 'offline' | 'changed' | 'error';

/** How long a new quotation stays valid, unless changed. */
const VALID_DAYS = 14;

/** State of one "New quotation" task, from the customer to the confirmed quotation. */
@Injectable({ providedIn: 'root' })
export class QuotationStore {
  private readonly api = inject(QuotationApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly sales = inject(SalesApiService);

  readonly reference = signal(newReference('QUO'));
  readonly customer = signal<{ id: string; name: string; meta: string | null } | null>(null);
  readonly lines = signal<QuoteLine[]>([]);
  /** ISO date; set from the site's today when the task starts. */
  readonly validTill = signal('');
  /** The site's today, the earliest a quotation can be valid until. */
  readonly today = signal('');
  readonly draft = signal<string | null>(null);
  readonly prefill = signal<PrefillNotice | null>(null);
  readonly state = signal<QuoteState>('idle');
  readonly failure = signal<QuoteFailure | null>(null);
  /** The confirmed quotation's name. */
  readonly result = signal<string | null>(null);
  /** The quotation page has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly savingDraft = signal(false);
  /** Each save's turn: only the latest one, in this task, may end the saving state. */
  private saveRun = 0;
  /** A draft was just opened for editing: the form's fresh visit must keep it, once. */
  private opened = false;
  /** The draft was saved on purpose, so starting over must keep it. */
  private readonly draftSaved = signal(false);

  readonly total = computed(() => quoteTotal(this.lines()));
  /** Complete enough to save: a customer, valid lines and a valid-until date. */
  readonly complete = computed(
    () =>
      !!this.customer() &&
      this.lines().length > 0 &&
      this.lines().every((l) => l.qty > 0 && l.rate >= 0) &&
      this.validDate(),
  );
  /** ERPNext refuses a valid-until date before the quotation's own date. */
  readonly validDate = computed(
    () => /^\d{4}-\d{2}-\d{2}$/.test(this.validTill()) && this.validTill() >= this.today(),
  );
  readonly ready = computed(() => this.complete() && this.state() !== 'confirming');
  /** A confirmation is running or its result is still open; leaving keeps the quotation. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
    forgetDeletedDrafts('quotation', this.draft, this.busy, () => this.start());
  }

  start(): void {
    const draft = this.draft();
    // A saved draft is the user's; only a draft a failed or unresolved confirmation left behind is cleaned up.
    if (draft && this.state() !== 'confirmed' && !this.draftSaved() && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('QUO'));
    this.customer.set(null);
    this.lines.set([]);
    this.validTill.set('');
    this.draft.set(null);
    this.prefill.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.saveRun++;
    this.savingDraft.set(false);
    this.draftSaved.set(false);
    void this.clock.ensure().then(() => {
      const today = this.clock.now();
      this.today.set(toIsoDate(today));
      if (!this.validTill()) {
        this.validTill.set(
          toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + VALID_DAYS)),
        );
      }
    });
  }

  /** Opens a saved draft quotation in the form; false while another confirmation is still open. */
  edit(draft: QuotationDetail): boolean {
    if (this.busy()) {
      return false;
    }
    this.load(draft);
    this.opened = true;
    return true;
  }

  private openRun = 0;

  /**
   * Opens `?draft=<name>` in the form under its own reference. The draft already open here keeps its unsaved
   * edits; another confirmation still open is kept, and the form shows that one.
   */
  async openDraft(name: string): Promise<'opened' | 'busy' | 'stale'> {
    if (this.busy() || (this.state() === 'confirmed' && !this.resultShown())) {
      return 'busy';
    }
    const run = ++this.openRun;
    if (this.draft() === name && this.state() !== 'confirmed') {
      this.draftSaved.set(true);
      return 'opened';
    }
    const business = await this.business.ensure();
    const owner = this.draftOwner(name);
    const detail = await this.api.draftQuotation(name, { company: business?.name ?? '', owner });
    if (run !== this.openRun) {
      return 'stale';
    }
    if (this.busy()) {
      return 'busy';
    }
    this.load(detail);
    return 'opened';
  }

  /** Opens an assistant proposal as a fresh quotation from today's prices; anything missing throws first. */
  async openPrefill(proposal: PrefillPayloads['quotation']): Promise<PrefillOpening> {
    if (this.busy() || (this.state() === 'confirmed' && !this.resultShown())) {
      return 'busy';
    }
    const caps = this.session.capabilities();
    const lines = mergeLines(proposal.lines);
    if (!caps.sell || !proposal.customer || !lines.length || lines.some((l) => !validQty(l.qty))) {
      throw new PrefillUnavailableError('quotation');
    }
    const run = ++this.openRun;
    const business = await this.business.ensure();
    if (!business) {
      throw new PrefillUnavailableError('business');
    }
    const [customer, items] = await Promise.all([
      this.sales.customer(proposal.customer, { name: business.name, currency: business.currency }),
      this.sales.itemsByCode(
        lines.map((line) => line.item_code),
        business.name,
        [],
      ),
    ]);
    if (run !== this.openRun) {
      return 'stale';
    }
    if (this.busy()) {
      return 'busy';
    }
    if (!customer) {
      throw new PrefillUnavailableError('customer');
    }
    const found = new Map(items.map((item) => [item.code, item]));
    const missing = lines.find((line) => !found.has(line.item_code));
    if (missing) {
      throw new PrefillUnavailableError(`item ${missing.item_code}`);
    }
    this.start();
    this.customer.set({
      id: customer.id,
      name: customer.name,
      meta: [customer.phone, customer.city].filter(Boolean).join(' · ') || null,
    });
    this.lines.set(
      lines.map((line) => {
        const item = found.get(line.item_code)!;
        return { item, qty: line.qty, rate: lineRate(line, caps.editPrice, item.price) };
      }),
    );
    this.prefill.set('filled');
    return 'opened';
  }

  prefillFailed(notice: 'expired' | 'unavailable' | 'busy'): void {
    if (notice === 'busy') {
      this.prefill.set(notice);
      return;
    }
    if (!this.busy() && !(this.state() === 'confirmed' && !this.resultShown())) {
      this.start();
      this.prefill.set(notice);
    }
  }

  private draftOwner(name: string): string | null {
    if (!OWN_SALES_ONLY.includes(this.session.persona())) {
      return null;
    }
    const id = this.session.user()?.id;
    if (!id) {
      throw new DraftUnavailableError(name);
    }
    return id;
  }

  private load(draft: QuotationDetail): void {
    if (this.draft() === draft.name) {
      // Left behind by a failed confirmation, and now opened on purpose: starting over must not delete it.
      this.draftSaved.set(true);
    }
    this.start();
    if (draft.reference) {
      this.reference.set(draft.reference);
    }
    this.customer.set({ id: draft.customer, name: draft.customerName, meta: null });
    this.lines.set(
      draft.lines.map((l) => ({
        item: {
          code: l.code,
          name: l.name,
          uom: l.uom,
          isStock: l.isStock,
          price: l.rate,
          stock: {},
        },
        qty: l.qty,
        rate: l.rate,
      })),
    );
    if (draft.validTill) {
      this.validTill.set(draft.validTill);
    }
    this.draft.set(draft.name);
    // The user saved it: starting over again keeps it.
    this.draftSaved.set(true);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen quotation; else start over. */
  resume(): void {
    const keep =
      this.opened || this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    this.opened = false;
    if (!keep) {
      this.start();
    }
  }

  setCustomer(customer: { id: string; name: string; meta: string | null } | null): void {
    this.clearFailure();
    this.customer.set(customer);
  }

  /** Adds the item at its selling price, or one more of it when it's already quoted. */
  addItem(item: CatalogItem): void {
    this.clearFailure();
    const lines = this.lines();
    const at = lines.findIndex((l) => l.item.code === item.code);
    this.lines.set(
      at >= 0
        ? lines.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l))
        : [...lines, { item, qty: 1, rate: item.price }],
    );
  }

  setQty(index: number, qty: number): void {
    if (qty <= 0) {
      this.removeLine(index);
      return;
    }
    this.clearFailure();
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, qty } : l)));
  }

  removeLine(index: number): void {
    this.clearFailure();
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  setRate(index: number, rate: number): void {
    this.clearFailure();
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, rate } : l)));
  }

  setValidTill(date: string): void {
    this.clearFailure();
    this.validTill.set(date);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not create the quotation twice.
    if (this.busy() || !this.ready()) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    let request: Awaited<ReturnType<typeof this.request>>;
    try {
      request = await this.request();
    } catch (error) {
      // Nothing was sent yet: a failure here must not leave the task "confirming".
      this.fail(error);
      return;
    }
    if (!request) {
      this.state.set('idle');
      return;
    }
    const current = () => this.reference() === request.reference;
    try {
      const quotation = await this.api.confirm(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(quotation);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** Saves the quotation as an ERPNext draft to finish later; resolves to its name, or null when it failed. */
  async saveDraft(): Promise<string | null> {
    if (this.busy() || this.savingDraft() || !this.complete()) {
      return null;
    }
    this.savingDraft.set(true);
    this.failure.set(null);
    const run = ++this.saveRun;
    const reference = this.reference();
    const current = () => this.reference() === reference;
    try {
      const request = await this.request();
      if (!request) {
        return null;
      }
      const name = await this.api.saveDraft(request, this.draft());
      if (!current()) {
        return null;
      }
      this.draft.set(name);
      this.draftSaved.set(true);
      if (this.state() === 'failed') {
        this.state.set('idle');
      }
      return name;
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
      return null;
    } finally {
      // By turn, not by reference: a "changed" failure replaces the reference, yet this save is still the latest.
      if (run === this.saveRun) {
        this.savingDraft.set(false);
      }
    }
  }

  /** After an unresolved confirmation: found shows the quotation, a draft or nothing returns to the form. */
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
      this.finish(found.quotation);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(quotation: string): void {
    this.result.set(quotation);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier version stands in ERPNext. Confirming again is a deliberate new quotation.
      this.draft.set(null);
      this.reference.set(newReference('QUO'));
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

  private async request(): Promise<QuotationRequest | null> {
    const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
    const customer = this.customer();
    if (!business || !customer || !this.lines().length) {
      return null;
    }
    return {
      reference: this.reference(),
      company: business.name,
      currency: business.currency,
      customer: customer.id,
      date: toIsoDate(this.clock.now()),
      validTill: this.validTill(),
      lines: this.lines().map((l) => ({
        item: l.item.code,
        uom: l.item.uom,
        qty: l.qty,
        rate: l.rate,
      })),
    };
  }
}

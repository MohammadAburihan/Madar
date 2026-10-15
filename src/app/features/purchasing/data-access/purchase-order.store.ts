import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import {
  SupplierDirectoryService,
  SupplierOption,
} from '../../../core/suppliers/supplier-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { PurchaseApiService } from './purchase-api.service';
import { OrderLine, OrderRequest, PurchaseItem, linesTotal } from './purchase.models';

export type OrderState = 'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type OrderFailure = 'permission' | 'offline' | 'changed' | 'error';

/** State of one "New purchase order" task, from choosing the supplier to the confirmed order. */
@Injectable({ providedIn: 'root' })
export class PurchaseOrderStore {
  private readonly api = inject(PurchaseApiService);
  private readonly business = inject(BusinessService);
  private readonly suppliersDirectory = inject(SupplierDirectoryService);
  private readonly clock = inject(SiteClockService);

  readonly reference = signal(newReference('PUR'));
  readonly suppliers = signal<SupplierOption[]>([]);
  readonly supplier = signal<string | null>(null);
  readonly lines = signal<OrderLine[]>([]);
  /** The project the order is bought for (a project's shortfall), booked on the order and its lines. */
  readonly project = signal<string | null>(null);
  /** An item and quantity to add once a supplier is chosen, from "Buy missing" on a project. */
  readonly prefill = signal<{ item: string; qty: number } | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<OrderState>('idle');
  readonly failure = signal<OrderFailure | null>(null);
  /** The confirmed order's name. */
  readonly result = signal<string | null>(null);
  /** The order page has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly savingDraft = signal(false);
  /** The draft was saved on purpose, so starting over must keep it. */
  private readonly draftSaved = signal(false);

  readonly total = computed(() => linesTotal(this.lines()));
  readonly supplierInfo = computed(
    () => this.suppliers().find((s) => s.id === this.supplier()) ?? null,
  );
  readonly ready = computed(
    () =>
      !!this.supplier() &&
      this.lines().length > 0 &&
      this.lines().every((l) => l.qty > 0 && l.rate >= 0) &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the order. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  start(): void {
    const draft = this.draft();
    // A saved draft is the user's; only a draft a failed or unresolved confirmation left behind is cleaned up.
    if (draft && this.state() !== 'confirmed' && !this.draftSaved()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('PUR'));
    this.supplier.set(null);
    this.lines.set([]);
    this.project.set(null);
    this.prefill.set(null);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.savingDraft.set(false);
    this.draftSaved.set(false);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen order; else start over. */
  resume(): void {
    if (!this.busy() && this.state() !== 'confirmed') {
      this.start();
    }
  }

  async loadSuppliers(): Promise<void> {
    this.suppliers.set(await this.suppliersDirectory.list());
  }

  setSupplier(supplier: string | null): void {
    this.clearFailure();
    this.supplier.set(supplier);
  }

  async searchItems(term: string, kind: 'product' | 'service'): Promise<PurchaseItem[]> {
    const business = await this.business.ensure();
    await this.clock.ensure();
    if (!business) {
      return [];
    }
    return this.api.searchItems(term, kind, {
      company: business.name,
      supplier: this.supplier() ?? '',
      currency: business.currency,
      date: toIsoDate(this.clock.now()),
    });
  }

  /** Books the order to a project and queues its shortfall item, as "Buy missing" on a project asks. */
  forProject(project: string, item: string | null, qty: number | null): void {
    this.project.set(project);
    this.prefill.set(item && qty && qty > 0 ? { item, qty } : null);
  }

  /** Once a supplier is chosen, adds the queued item at that supplier's buying price. */
  async applyPrefill(): Promise<void> {
    const prefill = this.prefill();
    const supplier = this.supplier();
    if (!prefill || !supplier) {
      return;
    }
    const [match] = (await this.searchItems(prefill.item, 'product')).filter(
      (i) => i.code === prefill.item,
    );
    // A quicker supplier change owns the prefill now; this price is the previous supplier's.
    if (this.supplier() !== supplier || this.prefill() !== prefill) {
      return;
    }
    // Only once: a later supplier change keeps the line the user may have edited.
    this.prefill.set(null);
    if (match && !this.lines().some((l) => l.item.code === match.code)) {
      this.lines.update((lines) => [...lines, { item: match, qty: prefill.qty, rate: match.rate }]);
    }
  }

  /** Adds the item at its buying price, or one more of it when it's already on the order. */
  addItem(item: PurchaseItem): void {
    this.clearFailure();
    const lines = this.lines();
    const at = lines.findIndex((l) => l.item.code === item.code);
    this.lines.set(
      at >= 0
        ? lines.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l))
        : [...lines, { item, qty: 1, rate: item.rate }],
    );
  }

  setQty(index: number, qty: number): void {
    this.clearFailure();
    this.lines.update((lines) =>
      qty > 0
        ? lines.map((l, i) => (i === index ? { ...l, qty } : l))
        : lines.filter((_, i) => i !== index),
    );
  }

  setRate(index: number, rate: number): void {
    this.clearFailure();
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, rate } : l)));
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not create the order twice.
    if (this.busy()) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    const request = await this.request();
    if (!request) {
      this.state.set('idle');
      return;
    }
    const current = () => this.reference() === request.reference;
    try {
      const order = await this.api.confirm(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(order);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** Saves the order as an ERPNext draft to finish later; resolves to its name, or null when it failed. */
  async saveDraft(): Promise<string | null> {
    if (this.busy() || this.savingDraft()) {
      return null;
    }
    this.savingDraft.set(true);
    this.failure.set(null);
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
      if (current()) {
        this.savingDraft.set(false);
      }
    }
  }

  /** After an unresolved confirmation: found shows the order, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    this.state.set('checking');
    try {
      const found = await this.api.find(this.reference());
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(found.order);
      return 'found';
    } catch {
      this.state.set('unresolved');
      return 'pending';
    }
  }

  private finish(order: string): void {
    this.result.set(order);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier version stands in ERPNext. Confirming again is a deliberate new order.
      this.draft.set(null);
      this.reference.set(newReference('PUR'));
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

  private async request(): Promise<OrderRequest | null> {
    const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
    const supplier = this.supplier();
    if (!business || !supplier || !this.lines().length) {
      return null;
    }
    return {
      reference: this.reference(),
      company: business.name,
      currency: business.currency,
      supplier,
      scheduleDate: toIsoDate(this.clock.now()),
      project: this.project(),
      lines: this.lines().map((l) => ({
        item: l.item.code,
        uom: l.item.uom,
        qty: l.qty,
        rate: l.rate,
      })),
    };
  }
}

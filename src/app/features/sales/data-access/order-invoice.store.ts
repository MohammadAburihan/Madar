import { Injectable, computed, inject, signal } from '@angular/core';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { InvoiceChangedError, SalesOrderApiService } from './sales-order-api.service';
import { OrderInvoicePreview, OrderInvoiceResult, SalesOrderDetail } from './sales-order.models';

export type OrderInvoiceState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type OrderInvoiceFailure = 'permission' | 'offline' | 'changed' | 'nothing' | 'error';

/** State of one "Invoice the order" task, from the review to the submitted invoice. */
@Injectable({ providedIn: 'root' })
export class OrderInvoiceStore {
  private readonly api = inject(SalesOrderApiService);
  private readonly business = inject(BusinessService);
  /** Drafts failed tries left, by order: invoicing roles can't delete them, so each is rebuilt on the next try. */
  private readonly leftDrafts = new Map<string, string>();

  readonly reference = signal(newReference('INV'));
  readonly orderName = signal<string | null>(null);
  readonly order = signal<SalesOrderDetail | null>(null);
  /** What ERPNext would bill now, as reviewed. */
  readonly preview = signal<OrderInvoicePreview | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<OrderInvoiceState>('idle');
  readonly failure = signal<OrderInvoiceFailure | null>(null);
  readonly result = signal<OrderInvoiceResult | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);

  readonly ready = computed(() => !!this.preview() && this.state() !== 'confirming');
  /** A confirmation is running or its result is still open; leaving keeps the invoice. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(order: string): void {
    this.reference.set(newReference('INV'));
    this.orderName.set(order);
    this.order.set(null);
    this.preview.set(null);
    this.draft.set(this.leftDrafts.get(order) ?? null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen invoice; else start over. */
  resume(order: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(order);
    }
  }

  /** Loads the order and what invoicing it would bill; "nothing" when ERPNext has nothing left to bill. */
  async load(): Promise<void> {
    const name = this.orderName();
    if (!name) {
      throw new Error('No order to invoice');
    }
    const reference = this.reference();
    const order = await this.api.order(name);
    let preview: OrderInvoicePreview | null = null;
    try {
      preview = await this.api.invoicePreview(name);
    } catch (error) {
      // ERPNext's mapper answers 417 when every row is billed already.
      if (ErpnextError.from(error).status !== 417) {
        throw error;
      }
    }
    if (this.reference() !== reference) {
      return;
    }
    this.order.set(order);
    this.preview.set(preview);
    if (!preview) {
      this.failure.set('nothing');
    }
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post the invoice twice.
    const preview = this.preview();
    const order = this.orderName();
    if (this.busy() || !preview || !order) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    const reference = this.reference();
    const current = () => this.reference() === reference;
    try {
      const business = await this.business.ensure();
      const invoice = await this.api.invoice(
        { reference, order, currency: business?.currency ?? '', total: preview.total },
        this.draft(),
        (name) => {
          this.leftDrafts.set(order, name);
          if (current()) {
            this.draft.set(name);
          }
        },
      );
      this.leftDrafts.delete(order);
      if (current()) {
        this.finish(invoice);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the invoice, a draft or nothing returns to the review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const business = await this.business.ensure();
      const found = await this.api.findInvoice(reference, business?.currency ?? '');
      if (!current()) {
        return 'pending';
      }
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.leftDrafts.set(this.orderName() ?? '', found.draft);
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.leftDrafts.delete(this.orderName() ?? '');
      this.finish(found.invoice);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(invoice: OrderInvoiceResult): void {
    this.result.set(invoice);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof InvoiceChangedError) {
      // Nothing was posted: the review must be reloaded to show what ERPNext would bill now.
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
}

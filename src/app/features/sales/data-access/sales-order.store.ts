import { Injectable, computed, inject, signal } from '@angular/core';
import { forgetDeletedDrafts } from '../../../core/tasks/deleted-drafts.service';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { SalesOrderApiService } from './sales-order-api.service';

export type OrderState = 'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type OrderFailure = 'permission' | 'offline' | 'changed' | 'error';

/** "Create sales order" from a confirmed quotation, from the tap to the submitted order. */
@Injectable({ providedIn: 'root' })
export class SalesOrderStore {
  private readonly api = inject(SalesOrderApiService);
  private readonly clock = inject(SiteClockService);

  readonly reference = signal(newReference('ORD'));
  /** The quotation the order is being made from. */
  readonly quotation = signal<string | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<OrderState>('idle');
  readonly failure = signal<OrderFailure | null>(null);
  /** The submitted order's name. */
  readonly result = signal<string | null>(null);

  /** A confirmation is running or its result is still open: no other order may start. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
    forgetDeletedDrafts('order', this.draft, this.busy, () => this.draft.set(null));
  }

  /** Makes and submits the order, expected for delivery on the site's today until changed on the order. */

  async create(quotation: string): Promise<void> {
    // Set before the first await: a double tap must not make the order twice.
    if (this.busy()) {
      return;
    }
    if (this.quotation() !== quotation || this.state() === 'confirmed') {
      this.start(quotation);
    }
    this.state.set('confirming');
    this.failure.set(null);
    const reference = this.reference();
    const current = () => this.reference() === reference;
    try {
      await this.clock.ensure();
      const order = await this.api.fromQuotation(
        { reference, quotation, deliveryDate: toIsoDate(this.clock.now()) },
        this.draft(),
        (name) => {
          if (current()) {
            this.draft.set(name);
          }
        },
      );
      if (current()) {
        this.result.set(order);
        this.state.set('confirmed');
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found is the order; a draft or nothing lets the user try again. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was made.
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
      this.result.set(found.order);
      this.state.set('confirmed');
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private start(quotation: string): void {
    const draft = this.draft();
    // Only a draft a failed confirmation left behind; a submitted order stays.
    if (draft && this.state() !== 'confirmed') {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('ORD'));
    this.quotation.set(quotation);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // An earlier attempt made an order that stands in ERPNext; another tap is a deliberate second order.
      this.draft.set(null);
      this.reference.set(newReference('ORD'));
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

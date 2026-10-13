import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  CustomerDirectoryService,
  CustomerOption,
} from '../../../core/customers/customer-directory.service';
import { parseNumber, round2 } from '../../../core/format/number';
import {
  PaymentAccount,
  PaymentAccountsService,
} from '../../../core/money/payment-accounts.service';
import { CollectionApiService } from './collection-api.service';
import { CollectionRequest, CollectionResult, UnpaidInvoice, allocate } from './collection.models';

export type CollectionState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type CollectionFailure = 'permission' | 'offline' | 'error';

/** State of one "Receive payment" task, from choosing the customer to the recorded payment. */
@Injectable({ providedIn: 'root' })
export class CollectionStore {
  private readonly api = inject(CollectionApiService);
  private readonly customers = inject(CustomerDirectoryService);
  private readonly paymentAccounts = inject(PaymentAccountsService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('COLL'));
  readonly customer = signal<CustomerOption | null>(null);
  readonly invoices = signal<UnpaidInvoice[]>([]);
  readonly loadingInvoices = signal(false);
  readonly invoicesFailed = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly amountInput = signal('');
  readonly accounts = signal<PaymentAccount[]>([]);
  readonly account = signal<PaymentAccount | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<CollectionState>('idle');
  readonly failure = signal<CollectionFailure | null>(null);
  readonly result = signal<CollectionResult | null>(null);
  private invoiceLoad = 0;

  readonly selectedInvoices = computed(() =>
    this.invoices().filter((invoice) => this.selected().has(invoice.name)),
  );
  readonly due = computed(() =>
    round2(this.selectedInvoices().reduce((sum, invoice) => sum + invoice.outstanding, 0)),
  );
  readonly amount = computed(() => {
    const value = parseNumber(this.amountInput());
    return Number.isFinite(value) ? round2(value) : NaN;
  });
  /** More than zero and no more than the chosen invoices still owe. */
  readonly amountValid = computed(() => this.amount() > 0 && this.amount() <= this.due());
  readonly dueAfter = computed(() => round2(this.due() - (this.amountValid() ? this.amount() : 0)));
  readonly allocations = computed(() =>
    this.amountValid() ? allocate(this.selectedInvoices(), this.amount()) : [],
  );
  readonly ready = computed(
    () =>
      !!this.customer() && this.amountValid() && !!this.account() && this.state() !== 'confirming',
  );
  /**
   * A confirmation is running or its result is still open. Leaving the task must keep the collection, its
   * reference and draft, so the result can still be shown or checked.
   */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  start(): void {
    const draft = this.draft();
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('COLL'));
    this.customer.set(null);
    this.invoices.set([]);
    this.invoicesFailed.set(false);
    this.selected.set(new Set());
    this.amountInput.set('');
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
  }

  async loadAccounts(): Promise<void> {
    const business = await this.business.ensure();
    if (!business) {
      return;
    }
    const accounts = await this.paymentAccounts.list(
      business.name,
      this.session.capabilities().paymentModes,
    );
    this.accounts.set(accounts);
    if (!this.account() || !accounts.some((a) => a.mode === this.account()!.mode)) {
      this.account.set(accounts[0] ?? null);
    }
  }

  async searchCustomers(term: string): Promise<CustomerOption[]> {
    const business = await this.business.ensure();
    return this.customers.search(term, business ?? undefined);
  }

  /**
   * Picks the customer and loads their unpaid invoices. All invoices on the oldest one's receivable account
   * are preselected, or only `only` when a deep link names one.
   */
  async selectCustomer(customer: CustomerOption, only?: string): Promise<void> {
    if (this.customer()?.id !== customer.id) {
      this.invoices.set([]);
      this.selected.set(new Set());
      this.amountInput.set('');
      this.clearFailure();
    }
    this.customer.set(customer);
    const load = ++this.invoiceLoad;
    const current = () => load === this.invoiceLoad;
    this.invoicesFailed.set(false);
    this.loadingInvoices.set(true);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const invoices = await this.api.unpaidInvoices(customer.id, business.name, business.currency);
      if (!current()) {
        return;
      }
      this.invoices.set(invoices);
      const named = invoices.find((i) => i.name === only);
      const account = invoices[0]?.receivable;
      this.setSelection(
        new Set(
          named
            ? [named.name]
            : invoices.filter((i) => i.receivable === account).map((i) => i.name),
        ),
      );
    } catch {
      if (current()) {
        this.invoicesFailed.set(true);
      }
    } finally {
      if (current()) {
        this.loadingInvoices.set(false);
      }
    }
  }

  /** Adds or removes an invoice; one on another receivable account starts a new selection. */
  toggle(invoice: string): void {
    const target = this.invoices().find((i) => i.name === invoice);
    if (!target) {
      return;
    }
    const sameAccount = this.selectedInvoices().every((i) => i.receivable === target.receivable);
    const next = new Set(sameAccount ? this.selected() : []);
    if (next.has(invoice)) {
      next.delete(invoice);
    } else {
      next.add(invoice);
    }
    this.setSelection(next);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not start a second confirmation (and a second payment).
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
    // If the collection was replaced meanwhile, this outcome belongs to it, not to the current one.
    const current = () => this.reference() === request.reference;
    try {
      const result = await this.api.confirm(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(result);
      }
    } catch (error) {
      if (!current()) {
        return;
      }
      if (error instanceof UnresolvedError) {
        this.state.set('unresolved');
        return;
      }
      const kind = ErpnextError.from(error).kind;
      this.failure.set(
        kind === 'forbidden' ? 'permission' : kind === 'offline' ? 'offline' : 'error',
      );
      this.state.set('failed');
    }
  }

  /** After an unresolved confirmation: found opens the result, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
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
      this.finish(found);
      return 'found';
    } catch {
      this.state.set('unresolved');
      return 'pending';
    }
  }

  /**
   * Entering the task from elsewhere: a half-done collection starts over, so invoices paid elsewhere since
   * are never offered from a stale list. A running or unresolved confirmation is kept, and so is a recorded
   * payment, so going back to its receipt still shows it (the choose step starts a new one from there).
   */
  resume(): void {
    if (!this.busy() && this.state() !== 'confirmed') {
      this.start();
    }
  }

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }

  private finish(result: CollectionResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  /** Changing which invoices are paid resets the amount to everything they still owe. */
  private setSelection(selected: Set<string>): void {
    this.clearFailure();
    this.selected.set(selected);
    this.amountInput.set(this.due() > 0 ? this.due().toFixed(2) : '');
  }

  private async request(): Promise<CollectionRequest | null> {
    const business = await this.business.ensure();
    const customer = this.customer();
    const account = this.account();
    if (!business || !customer || !account || !this.amountValid()) {
      return null;
    }
    return {
      reference: this.reference(),
      company: business.name,
      customer: customer.id,
      account,
      amount: this.amount(),
      allocations: this.allocations(),
    };
  }
}

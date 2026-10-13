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
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly amountInput = signal('');
  readonly accounts = signal<PaymentAccount[]>([]);
  readonly account = signal<PaymentAccount | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<CollectionState>('idle');
  readonly failure = signal<CollectionFailure | null>(null);
  readonly result = signal<CollectionResult | null>(null);

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
  /** Leaving after a timeout must keep the reference so the result can still be checked. */
  readonly busy = computed(() => ['unresolved', 'checking'].includes(this.state()));

  start(): void {
    this.reference.set(newReference('COLL'));
    this.customer.set(null);
    this.invoices.set([]);
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

  searchCustomers(term: string): Promise<CustomerOption[]> {
    return this.customers.search(term);
  }

  /** Picks the customer and loads their unpaid invoices; `only` preselects one invoice instead of all. */
  async selectCustomer(customer: CustomerOption, only?: string): Promise<void> {
    if (this.customer()?.id !== customer.id) {
      this.invoices.set([]);
      this.selected.set(new Set());
      this.amountInput.set('');
    }
    this.customer.set(customer);
    const business = await this.business.ensure();
    if (!business) {
      return;
    }
    this.loadingInvoices.set(true);
    try {
      const invoices = await this.api.unpaidInvoices(customer.id, business.name);
      if (this.customer()?.id !== customer.id) {
        return;
      }
      this.invoices.set(invoices);
      const preselect = invoices.some((i) => i.name === only)
        ? [only!]
        : invoices.map((i) => i.name);
      this.setSelection(new Set(preselect));
    } finally {
      this.loadingInvoices.set(false);
    }
  }

  toggle(invoice: string): void {
    const next = new Set(this.selected());
    if (next.has(invoice)) {
      next.delete(invoice);
    } else {
      next.add(invoice);
    }
    this.setSelection(next);
  }

  async confirm(): Promise<void> {
    const request = await this.request();
    if (!request) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    try {
      this.finish(await this.api.confirm(request, this.draft(), (name) => this.draft.set(name)));
    } catch (error) {
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

  private finish(result: CollectionResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  /** Changing which invoices are paid resets the amount to everything they still owe. */
  private setSelection(selected: Set<string>): void {
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

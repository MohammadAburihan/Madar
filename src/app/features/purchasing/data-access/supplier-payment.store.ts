import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import {
  PaymentAccount,
  PaymentAccountsService,
} from '../../../core/money/payment-accounts.service';
import { SupplierInvoice, SupplierPaymentRequest, UnpaidSupplierInvoice } from './purchase.models';
import { SupplierInvoiceApiService } from './supplier-invoice-api.service';
import { SupplierPaymentApiService } from './supplier-payment-api.service';

export type PayState = 'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type PayFailure = 'permission' | 'offline' | 'changed' | 'error';

/** State of one "Pay supplier" task, from the invoice and amount to the recorded payment. */
@Injectable({ providedIn: 'root' })
export class SupplierPaymentStore {
  private readonly api = inject(SupplierPaymentApiService);
  private readonly invoices = inject(SupplierInvoiceApiService);
  private readonly business = inject(BusinessService);
  private readonly paymentAccounts = inject(PaymentAccountsService);

  readonly reference = signal(newReference('PAYS'));
  /** The invoice the task was opened from, by name; set before it has loaded. */
  readonly invoiceName = signal<string | null>(null);
  /** The invoice the task was opened from, for the supplier and the way back. */
  readonly invoice = signal<SupplierInvoice | null>(null);
  readonly unpaid = signal<UnpaidSupplierInvoice[]>([]);
  readonly selected = signal<string | null>(null);
  readonly amountInput = signal('');
  readonly accounts = signal<PaymentAccount[]>([]);
  /** The chosen Mode of Payment. */
  readonly account = signal<string | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<PayState>('idle');
  readonly failure = signal<PayFailure | null>(null);
  /** The recorded payment's name. */
  readonly result = signal<string | null>(null);
  /** The recorded step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<SupplierPaymentRequest | null>(null);
  readonly savingDraft = signal(false);
  /** The draft was saved on purpose, so starting over must keep it. */
  private readonly draftSaved = signal(false);

  /** The invoice the task was opened from is paid, or in another currency than the company's. */
  readonly openedNotPayable = computed(
    () => !!this.invoice() && !this.unpaid().some((i) => i.name === this.invoiceName()),
  );
  readonly selectedInvoice = computed(
    () => this.unpaid().find((i) => i.name === this.selected()) ?? null,
  );
  readonly chosenAccount = computed(
    () => this.accounts().find((a) => a.mode === this.account()) ?? null,
  );
  readonly amount = computed(() => parseNumber(this.amountInput()));
  /** More than zero and no more than the invoice still owes. */
  readonly amountValid = computed(() => {
    const owed = this.selectedInvoice()?.outstanding ?? 0;
    return Number.isFinite(this.amount()) && this.amount() > 0 && this.amount() <= owed + 0.005;
  });
  readonly ready = computed(
    () =>
      !!this.selectedInvoice() &&
      !!this.chosenAccount() &&
      this.amountValid() &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the payment. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  start(invoice: string): void {
    const draft = this.draft();
    // A saved draft is the user's; only a draft a failed or unresolved confirmation left behind is cleaned up.
    if (draft && this.state() !== 'confirmed' && !this.busy() && !this.draftSaved()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('PAYS'));
    this.invoiceName.set(invoice);
    this.invoice.set(null);
    this.unpaid.set([]);
    this.selected.set(null);
    this.amountInput.set('');
    this.account.set(null);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
    this.savingDraft.set(false);
    this.draftSaved.set(false);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen payment; else start over. */
  resume(invoice: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(invoice);
    }
  }

  /** Loads the invoice, the supplier's other unpaid invoices and the accounts to pay from. */
  async load(allowedModes: 'all' | readonly string[]): Promise<void> {
    const name = this.invoiceName();
    const business = await this.business.ensure();
    if (!name || !business) {
      throw new Error('No invoice or business to pay');
    }
    const reference = this.reference();
    const invoice = await this.invoices.invoice(name);
    const [unpaid, accounts] = await Promise.all([
      this.api.unpaidInvoices(invoice.supplier, business.name, business.currency, name),
      this.paymentAccounts.list(business.name, allowedModes),
    ]);
    if (this.reference() !== reference) {
      return;
    }
    this.invoice.set(invoice);
    this.unpaid.set(unpaid);
    this.accounts.set(accounts);
    this.account.set(accounts[0]?.mode ?? null);
    // Never another invoice in its place: if the opened one can't be paid here, the user chooses.
    this.selectInvoice(unpaid.find((i) => i.name === name)?.name ?? null);
  }

  /** Picks the invoice to pay and suggests paying what it still owes. */
  selectInvoice(invoice: string | null): void {
    this.clearFailure();
    this.selected.set(invoice);
    const owed = this.selectedInvoice()?.outstanding;
    this.amountInput.set(owed === undefined ? '' : owed.toFixed(2));
  }

  setAmount(input: string): void {
    this.clearFailure();
    this.amountInput.set(input);
  }

  setAccount(mode: string | null): void {
    this.clearFailure();
    this.account.set(mode);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not pay twice.
    if (this.busy()) {
      return;
    }
    const request = this.request();
    if (!request) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const payment = await this.api.confirm(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(payment);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** Saves the payment as an ERPNext draft to finish later; resolves to its name, or null when it failed. */
  async saveDraft(): Promise<string | null> {
    if (this.busy() || this.savingDraft()) {
      return null;
    }
    const request = this.request();
    if (!request) {
      return null;
    }
    this.savingDraft.set(true);
    this.failure.set(null);
    const current = () => this.reference() === request.reference;
    try {
      const name = await this.api.saveDraft(request, this.draft());
      if (!current()) {
        return null;
      }
      this.draft.set(name);
      this.draftSaved.set(true);
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

  /** After an unresolved confirmation: found shows the payment, a draft or nothing returns to the form. */
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
      this.finish(found.payment);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(payment: string): void {
    this.result.set(payment);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier payment stands in ERPNext. Paying again is a deliberate new payment.
      this.draft.set(null);
      this.draftSaved.set(false);
      this.reference.set(newReference('PAYS'));
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

  private request(): SupplierPaymentRequest | null {
    const invoice = this.selectedInvoice();
    const account = this.chosenAccount();
    if (!invoice || !account || !this.ready()) {
      return null;
    }
    return {
      reference: this.reference(),
      invoice: invoice.name,
      amount: Math.round(this.amount() * 100) / 100,
      account: { mode: account.mode, account: account.account, label: account.label },
    };
  }
}

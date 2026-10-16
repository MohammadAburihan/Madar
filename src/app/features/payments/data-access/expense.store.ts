import { Injectable, computed, inject, signal } from '@angular/core';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { parseNumber } from '../../../core/format/number';
import {
  PaymentAccount,
  PaymentAccountsService,
} from '../../../core/money/payment-accounts.service';
import {
  ProjectDirectoryService,
  ProjectOption,
} from '../../../core/projects/project-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { ExpenseApiService } from './expense-api.service';
import { ExpenseCategory, ExpenseRequest } from './expense.models';

export type ExpenseState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type ExpenseFailure = 'permission' | 'offline' | 'changed' | 'error';
export type ReceiptState = 'none' | 'attaching' | 'attached' | 'failed';

const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);

/** State of one "Record expense" task, from the details to the recorded expense and its receipt. */
@Injectable({ providedIn: 'root' })
export class ExpenseStore {
  private readonly api = inject(ExpenseApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly paymentAccounts = inject(PaymentAccountsService);
  private readonly projectDirectory = inject(ProjectDirectoryService);

  readonly reference = signal(newReference('EXP'));
  readonly loaded = signal(false);
  readonly categories = signal<ExpenseCategory[]>([]);
  readonly accounts = signal<PaymentAccount[]>([]);
  readonly projects = signal<ProjectOption[]>([]);
  readonly category = signal<string | null>(null);
  readonly amountInput = signal('');
  /** The posting date, `YYYY-MM-DD`. */
  readonly date = signal('');
  /** The chosen Mode of Payment. */
  readonly account = signal<string | null>(null);
  readonly project = signal<string | null>(null);
  readonly receipt = signal<File | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<ExpenseState>('idle');
  readonly failure = signal<ExpenseFailure | null>(null);
  /** The recorded expense's name. */
  readonly result = signal<string | null>(null);
  /** The recorded step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<ExpenseRequest | null>(null);
  /** Attaching the receipt comes after recording, and its failure leaves the expense recorded. */
  readonly receiptState = signal<ReceiptState>('none');

  readonly amount = computed(() => parseNumber(this.amountInput()));
  readonly amountValid = computed(() => Number.isFinite(this.amount()) && this.amount() > 0);
  readonly chosenCategory = computed(
    () => this.categories().find((c) => c.account === this.category()) ?? null,
  );
  readonly chosenAccount = computed(
    () => this.accounts().find((a) => a.mode === this.account()) ?? null,
  );
  readonly chosenProject = computed(
    () => this.projects().find((p) => p.id === this.project()) ?? null,
  );
  readonly ready = computed(
    () =>
      !!this.chosenCategory() &&
      !!this.chosenAccount() &&
      this.amountValid() &&
      validDate(this.date()) &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the expense. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(): void {
    const draft = this.draft();
    // Only a draft a failed or unresolved confirmation left behind; a recorded expense stays.
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('EXP'));
    this.loaded.set(false);
    this.category.set(null);
    this.amountInput.set('');
    this.date.set('');
    this.account.set(null);
    this.project.set(null);
    this.receipt.set(null);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
    this.receiptState.set('none');
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen expense; else start over. */
  resume(): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start();
    }
  }

  /** Loads the categories, the accounts to pay from and the open projects, and suggests today's date. */
  async load(allowedModes: 'all' | readonly string[]): Promise<void> {
    const business = await this.business.ensure();
    if (!business) {
      throw new Error('No business to record the expense for');
    }
    const reference = this.reference();
    const [categories, accounts, projects] = await Promise.all([
      this.api.categories(business.name),
      this.paymentAccounts.list(business.name, allowedModes),
      // Projects are optional: a role that can't read them records the expense without one.
      this.projectDirectory.open(business.name).catch(() => []),
      this.clock.ensure(),
    ]);
    if (this.reference() !== reference) {
      return;
    }
    this.categories.set(categories);
    // A foreign-currency account would need an exchange rate; Madar records expenses in the company currency.
    const usable = accounts.filter((a) => !a.currency || a.currency === business.currency);
    this.accounts.set(usable);
    this.projects.set(projects);
    const kept = usable.some((a) => a.mode === this.account());
    this.account.set(kept ? this.account() : (usable[0]?.mode ?? null));
    this.date.set(this.date() || toIsoDate(this.clock.now()));
    this.loaded.set(true);
  }

  setCategory(category: string | null): void {
    this.clearFailure();
    this.category.set(category);
  }

  setAmount(input: string): void {
    this.clearFailure();
    this.amountInput.set(input);
  }

  setDate(date: string): void {
    this.clearFailure();
    this.date.set(date);
  }

  setAccount(mode: string | null): void {
    this.clearFailure();
    this.account.set(mode);
  }

  setProject(project: string | null): void {
    this.clearFailure();
    this.project.set(project);
  }

  setReceipt(file: File | null): void {
    this.receipt.set(file);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not record the expense twice.
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
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const expense = await this.api.record(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(expense);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the expense, a draft or nothing returns to review. */
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
      this.finish(found.expense);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  /** Attaches the chosen receipt to the recorded expense; can be retried after a failure. */
  async attachReceipt(): Promise<void> {
    const expense = this.result();
    const file = this.receipt();
    if (
      !expense ||
      !file ||
      this.receiptState() === 'attaching' ||
      this.receiptState() === 'attached'
    ) {
      return;
    }
    const reference = this.reference();
    this.receiptState.set('attaching');
    try {
      await this.api.attachReceipt(expense, file);
      if (this.reference() === reference) {
        this.receiptState.set('attached');
      }
    } catch {
      if (this.reference() === reference) {
        this.receiptState.set('failed');
      }
    }
  }

  private finish(expense: string): void {
    this.result.set(expense);
    this.state.set('confirmed');
    // A new expense's receipt starts over, whatever happened to an earlier one's.
    this.receiptState.set('none');
    if (this.receipt()) {
      void this.attachReceipt();
    }
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier expense stands in ERPNext. Recording again is a deliberate new expense.
      this.draft.set(null);
      this.reference.set(newReference('EXP'));
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

  private async request(): Promise<ExpenseRequest | null> {
    const business = await this.business.ensure();
    const category = this.chosenCategory();
    const account = this.chosenAccount();
    // Not ready(): the state is already "confirming" here.
    if (!business || !category || !account || !this.amountValid() || !validDate(this.date())) {
      return null;
    }
    return {
      reference: this.reference(),
      company: business.name,
      category: category.account,
      amount: Math.round(this.amount() * 100) / 100,
      date: this.date(),
      account: {
        mode: account.mode,
        account: account.account,
        label: account.label,
        isBank: account.isBank,
      },
      project: this.chosenProject()?.id ?? null,
    };
  }
}

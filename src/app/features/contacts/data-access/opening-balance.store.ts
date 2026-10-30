import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { parseNumber } from '../../../core/format/number';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import {
  OpeningBalanceApiService,
  OpeningChangedError,
  OpeningRequest,
  OpeningResult,
  OpeningTarget,
} from './opening-balance-api.service';
import { ContactKind } from './contacts.models';

export type OpeningState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type OpeningFailure = 'permission' | 'offline' | 'changed' | 'error';

const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);

/** State of one "Opening balance" task for one customer or supplier: details, review, and the posted invoice. */
@Injectable({ providedIn: 'root' })
export class OpeningBalanceStore {
  private readonly api = inject(OpeningBalanceApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);

  readonly reference = signal(newReference('OPN'));
  readonly kind = signal<ContactKind>('customers');
  readonly partyId = signal('');
  readonly target = signal<OpeningTarget | null>(null);
  readonly loaded = signal(false);
  readonly loadFailed = signal(false);
  readonly amountInput = signal('');
  /** The posting date, `YYYY-MM-DD`. */
  readonly date = signal('');
  /** The site's today: the latest date an opening balance can be dated. */
  readonly today = signal('');
  readonly note = signal('');
  readonly step = signal<'form' | 'review'>('form');
  readonly state = signal<OpeningState>('idle');
  readonly failure = signal<OpeningFailure | null>(null);
  /** ERPNext's own words for a definite refusal (credit limit, frozen customer, closed period). */
  readonly failureMessage = signal<string | null>(null);
  readonly result = signal<OpeningResult | null>(null);
  /** The result step has shown the invoice; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<OpeningRequest | null>(null);
  /** An answer was lost under this reference: the details stay as sent, since that try may still land. */
  readonly lost = signal(false);
  /** Set when "Check result" found that a lost request was never recorded. */
  readonly notCreated = signal(false);

  private turn = 0;

  readonly amount = computed(() => parseNumber(this.amountInput()));
  readonly precision = computed(() => this.target()?.precision ?? 2);
  /** What is wrong with the typed amount: not above 0, or more decimals than ERPNext keeps (never rounded silently). */
  readonly amountProblem = computed<'invalid' | 'decimals' | null>(() => {
    const amount = this.amount();
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'invalid';
    }
    const scaled = amount * 10 ** this.precision();
    return Math.abs(scaled - Math.round(scaled)) > 1e-6 ? 'decimals' : null;
  });
  /** The amount as it will be posted. */
  readonly postedAmount = computed(() =>
    this.amountProblem()
      ? 0
      : Math.round(this.amount() * 10 ** this.precision()) / 10 ** this.precision(),
  );
  readonly ready = computed(
    () =>
      !!this.target() &&
      !this.target()?.blocked &&
      this.postedAmount() > 0 &&
      this.dateValid() &&
      this.state() !== 'confirming',
  );
  readonly dateValid = computed(
    () => validDate(this.date()) && (!this.today() || this.date() <= this.today()),
  );
  /** A confirmation is running or its result is still open; leaving keeps the task. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));
  readonly locked = computed(() => this.busy() || this.lost() || this.state() === 'confirmed');

  constructor() {
    inject(OpenTasksService).register(this.busy);
    // The task holds one user's business data: it never carries over to another user or business.
    let user: string | null | undefined;
    let company: string | null = null;
    effect(() => {
      const nextUser = this.session.user()?.id ?? null;
      const nextCompany = this.business.active()?.name ?? null;
      const changed =
        (user !== undefined && user !== nextUser) ||
        (company !== null && nextCompany !== null && company !== nextCompany);
      user = nextUser;
      company = nextCompany ?? company;
      if (changed) {
        untracked(() => this.start(this.kind(), ''));
      }
    });
  }

  start(kind: ContactKind, partyId: string): void {
    this.turn++;
    this.reference.set(newReference('OPN'));
    this.kind.set(kind);
    this.partyId.set(partyId);
    this.target.set(null);
    this.loaded.set(false);
    this.loadFailed.set(false);
    this.amountInput.set('');
    this.date.set('');
    this.today.set('');
    this.note.set('');
    this.step.set('form');
    this.state.set('idle');
    this.failure.set(null);
    this.failureMessage.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
    this.lost.set(false);
    this.notCreated.set(false);
  }

  /**
   * Entering the task from a contact's page: keeps a running, unresolved or unseen one (whoever it is for);
   * otherwise starts over. Returns whether the task kept is for another contact.
   */
  resume(kind: ContactKind, partyId: string): boolean {
    const same = this.kind() === kind && this.partyId() === partyId;
    // A lost answer may still land: the task stays as sent, under its reference, for the same contact.
    const keep =
      this.busy() ||
      (this.state() === 'confirmed' && !this.resultShown()) ||
      (this.lost() && same && this.state() !== 'confirmed');
    if (!keep) {
      this.start(kind, partyId);
      return false;
    }
    return !same;
  }

  /** Reads the contact and the business setup, and suggests today's date. */
  async load(): Promise<void> {
    const turn = ++this.turn;
    const reference = this.reference();
    this.loadFailed.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business to record the opening balance for');
      }
      const [target] = await Promise.all([
        this.api.target(this.kind(), this.partyId(), business),
        this.clock.ensure(),
      ]);
      if (this.turn !== turn || this.reference() !== reference) {
        return;
      }
      this.target.set(target);
      this.today.set(toIsoDate(this.clock.now()));
      this.date.set(this.date() || this.today());
      this.loaded.set(true);
    } catch {
      if (this.turn === turn && this.reference() === reference) {
        this.loadFailed.set(true);
      }
    }
  }

  setAmount(input: string): void {
    this.edit(() => this.amountInput.set(input));
  }

  setDate(date: string): void {
    this.edit(() => this.date.set(date));
  }

  setNote(note: string): void {
    this.edit(() => this.note.set(note));
  }

  review(): void {
    if (this.ready()) {
      this.step.set('review');
    }
  }

  back(): void {
    if (!this.busy() && this.state() !== 'confirmed') {
      this.step.set('form');
    }
  }

  async confirm(itemName: string): Promise<void> {
    // Set before the first await: a double tap must not post the invoice twice.
    if (this.busy() || this.state() === 'confirmed') {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    this.failureMessage.set(null);
    this.notCreated.set(false);
    const request = await this.request(itemName);
    if (!request) {
      this.state.set('idle');
      return;
    }
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const result = await this.api.record(request);
      if (current()) {
        this.finish(result);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After "Check result" found nothing: drops the task, details and reference, for a fresh one. */
  startOver(): void {
    if (this.state() !== 'idle' || !this.lost() || !this.notCreated()) {
      return;
    }
    this.start(this.kind(), this.partyId());
    void this.load();
  }

  /** After an unresolved confirmation: looks the reference up, never sends. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    const request = this.sent();
    if (this.state() !== 'unresolved' || !request) {
      return 'pending';
    }
    const reference = request.reference;
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const posted = await this.api.posted(request);
      if (!current()) {
        return 'pending';
      }
      if (!posted) {
        this.notCreated.set(true);
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(posted);
      return 'found';
    } catch (error) {
      if (current()) {
        if (error instanceof OpeningChangedError) {
          this.fail(error);
        } else {
          this.state.set('unresolved');
        }
      }
      return 'pending';
    }
  }

  private edit(change: () => void): void {
    if (this.locked()) {
      return;
    }
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
      this.failureMessage.set(null);
      // A plain refusal wrote nothing; the old request must not describe the edited task.
      this.sent.set(null);
    }
    this.notCreated.set(false);
    change();
  }

  private finish(result: OpeningResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.lost.set(true);
      this.state.set('unresolved');
      return;
    }
    if (error instanceof OpeningChangedError) {
      // The invoice stands in ERPNext. Recording again is a deliberate new opening balance.
      this.reference.set(newReference('OPN'));
      this.lost.set(false);
      this.failure.set('changed');
      this.state.set('failed');
      return;
    }
    const erpnextError = ErpnextError.from(error);
    if (erpnextError.kind === 'forbidden') {
      void this.session.checkExpired();
    }
    // Only Frappe's own words for a refusal; a bare HTTP error line means nothing to the user.
    this.failureMessage.set(
      erpnextError.kind === 'server' && erpnextError.status >= 400 && erpnextError.status < 500
        ? erpnextError.userMessage
        : null,
    );
    this.failure.set(
      erpnextError.kind === 'forbidden'
        ? 'permission'
        : erpnextError.kind === 'offline'
          ? 'offline'
          : 'error',
    );
    this.state.set('failed');
  }

  private async request(itemName: string): Promise<OpeningRequest | null> {
    const business = await this.business.ensure();
    const target = this.target();
    // Not ready(): the state is already "confirming" here.
    if (!business || !target || target.blocked || this.postedAmount() <= 0 || !this.dateValid()) {
      return null;
    }
    return {
      reference: this.reference(),
      kind: this.kind(),
      party: target.id,
      company: business.name,
      currency: business.currency,
      amount: this.postedAmount(),
      date: this.date(),
      note: this.note(),
      itemName,
      account: target.account,
      costCenter: target.costCenter,
      uom: target.uom,
    };
  }
}

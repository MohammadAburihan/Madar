import { Injectable, computed, inject, signal } from '@angular/core';
import { lineRate, mergeLines, validQty } from '../../../core/tasks/prefill-lines';
import {
  PrefillNotice,
  PrefillOpening,
  PrefillUnavailableError,
} from '../../../core/tasks/prefill-entry';
import { PrefillPayloads } from '../../../core/tasks/task-prefill.service';
import { forgetDeletedDrafts } from '../../../core/tasks/deleted-drafts.service';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { WALK_IN_CUSTOMER } from '../../../core/customers/customer-directory.service';
import { CatalogFilter, SalesApiService } from './sales-api.service';
import {
  CatalogItem,
  CustomerOption,
  NewCustomer,
  PaymentAccount,
  PaymentStatus,
  SaleLine,
  SaleProject,
  SaleRequest,
  SaleResult,
  WarehouseOption,
  lineTotal,
  parseNumber,
  round2,
} from './sale.models';

export type ConfirmState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type ConfirmFailure = 'stock' | 'permission' | 'offline' | 'changed' | 'error';

/** One sale in progress, kept across the quick-sale steps until it is confirmed or discarded. */
@Injectable({ providedIn: 'root' })
export class QuickSaleStore {
  private readonly api = inject(SalesApiService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('SALE'));
  readonly customer = signal<CustomerOption | null>(null);
  readonly walkIn = signal(false);
  /** The customer project this sale is billed to; the customer is then the project's and can't be changed. */
  readonly project = signal<SaleProject | null>(null);
  readonly warehouses = signal<WarehouseOption[]>([]);
  readonly warehouse = signal<string | null>(null);
  readonly lines = signal<SaleLine[]>([]);
  readonly paymentStatus = signal<PaymentStatus>('paid');
  readonly amountInput = signal('');
  readonly accounts = signal<PaymentAccount[]>([]);
  readonly account = signal<PaymentAccount | null>(null);
  readonly draft = signal<string | null>(null);
  /** The opened draft's customer is disabled: ERPNext refuses any sale to them until another is chosen. */
  readonly customerInactive = signal(false);
  readonly state = signal<ConfirmState>('idle');
  readonly prefill = signal<PrefillNotice | null>(null);
  private readonly openConfirmation = computed(() =>
    ['confirming', 'unresolved', 'checking'].includes(this.state()),
  );

  constructor() {
    inject(OpenTasksService).register(this.openConfirmation);
    forgetDeletedDrafts('sale', this.draft, this.openConfirmation, () => this.start());
  }
  readonly failure = signal<ConfirmFailure | null>(null);
  readonly result = signal<SaleResult | null>(null);
  /** Lines as confirmed, so the receipt stays correct after the basket is cleared for the next sale. */
  readonly confirmedLines = signal<SaleLine[]>([]);

  readonly hasCustomer = computed(() => this.walkIn() || !!this.customer());
  readonly customerName = computed(() => (this.walkIn() ? null : (this.customer()?.name ?? null)));
  readonly total = computed(() =>
    round2(this.lines().reduce((sum, line) => sum + lineTotal(line), 0)),
  );
  readonly units = computed(() => this.lines().reduce((sum, line) => sum + line.qty, 0));
  readonly warehouseName = computed(
    () => this.warehouses().find((w) => w.id === this.warehouse())?.name ?? null,
  );
  readonly amountPaid = computed(() => {
    const status = this.paymentStatus();
    if (status === 'unpaid') {
      return 0;
    }
    if (status === 'paid') {
      return this.total();
    }
    const value = parseNumber(this.amountInput());
    return Number.isFinite(value) ? round2(value) : NaN;
  });
  readonly outstanding = computed(() => round2(this.total() - (this.amountPaid() || 0)));
  /** Unsaved work worth a leave prompt. Not after a timeout: saving or discarding then could duplicate the sale. */
  readonly dirty = computed(
    () => this.lines().length > 0 && ['idle', 'confirming', 'failed'].includes(this.state()),
  );
  /** Partial payments must be more than zero and less than the total. */
  readonly amountValid = computed(() => {
    const amount = this.amountPaid();
    return this.paymentStatus() !== 'partial' || (amount > 0 && amount < this.total());
  });

  start(): void {
    this.reference.set(newReference('SALE'));
    this.customer.set(null);
    this.walkIn.set(false);
    this.project.set(null);
    this.warehouse.set(null);
    this.lines.set([]);
    this.paymentStatus.set('paid');
    this.amountInput.set('');
    this.account.set(null);
    this.draft.set(null);
    this.customerInactive.set(false);
    this.prefill.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
  }

  private openRun = 0;

  /**
   * Opens a saved draft sale at the basket under its own reference, so confirming submits that draft and a
   * timed-out confirmation can still be found. The draft already open here keeps its unsaved edits.
   */
  async openDraft(name: string): Promise<'opened' | 'busy' | 'stale'> {
    if (this.openConfirmation()) {
      return 'busy';
    }
    const run = ++this.openRun;
    if (this.draft() !== name || this.state() === 'confirmed') {
      const business = await this.business.ensure();
      const ownOnly = OWN_SALES_ONLY.includes(this.session.persona());
      const owner = ownOnly ? (this.session.user()?.id ?? null) : null;
      if (ownOnly && !owner) {
        throw new DraftUnavailableError(name);
      }
      const sale = await this.api.draftSale(name, { company: business?.name ?? '', owner });
      const project = sale.project
        ? await this.api.project(sale.project, business?.name ?? '').catch(() => null)
        : null;
      if (run !== this.openRun) {
        return 'stale';
      }
      if (this.openConfirmation()) {
        return 'busy';
      }
      this.start();
      this.reference.set(sale.reference);
      this.draft.set(sale.name);
      const walkIn = sale.customer === WALK_IN_CUSTOMER || sale.customerName === WALK_IN_CUSTOMER;
      this.walkIn.set(walkIn);
      this.customer.set(
        walkIn
          ? null
          : {
              id: sale.customer,
              name: sale.customerName,
              phone: null,
              city: null,
              outstanding: 0,
              unpaidInvoices: 0,
            },
      );
      this.project.set(
        sale.project ? { id: sale.project, title: project?.title ?? sale.project } : null,
      );
      this.customerInactive.set(!walkIn && !sale.customerActive);
      this.lines.set(sale.lines);
      this.warehouse.set(sale.warehouse);
    }
    await this.loadOptions();
    if (run !== this.openRun) {
      return 'stale';
    }
    if (this.warehouse() && !this.warehouses().some((w) => w.id === this.warehouse())) {
      this.warehouse.set(null);
    }
    return 'opened';
  }

  /** Opens an assistant proposal as a fresh sale from today's prices and stock; anything missing throws first. */
  async openPrefill(proposal: PrefillPayloads['quick_sale']): Promise<PrefillOpening> {
    if (this.openConfirmation()) {
      return 'busy';
    }
    const caps = this.session.capabilities();
    const lines = mergeLines(proposal.lines);
    if (
      !caps.sell ||
      (proposal.walkIn && (!caps.sellToWalkIn || proposal.project)) ||
      (!proposal.walkIn && !proposal.customer && !proposal.project) ||
      (!lines.length && !proposal.project) ||
      lines.some((line) => !validQty(line.qty))
    ) {
      throw new PrefillUnavailableError('sale');
    }
    const run = ++this.openRun;
    const business = await this.business.ensure();
    if (!business) {
      throw new PrefillUnavailableError('business');
    }
    const project = proposal.project
      ? await this.api.project(proposal.project, business.name)
      : null;
    if (
      proposal.project &&
      (!project ||
        project.cancelled ||
        !project.customer ||
        (proposal.customer && proposal.customer !== project.customer))
    ) {
      throw new PrefillUnavailableError('project');
    }
    const customerId = project?.customer ?? proposal.customer;
    const warehouses = await this.api.warehouses(business.name);
    const [customer, items] = await Promise.all([
      proposal.walkIn
        ? Promise.resolve(null)
        : this.api.customer(customerId!, {
            name: business.name,
            currency: business.currency,
          }),
      this.api.itemsByCode(
        lines.map((line) => line.item_code),
        business.name,
        warehouses.map((w) => w.id),
      ),
    ]);
    if (run !== this.openRun) {
      return 'stale';
    }
    if (this.openConfirmation()) {
      return 'busy';
    }
    if (!proposal.walkIn && !customer) {
      throw new PrefillUnavailableError('customer');
    }
    const found = new Map(items.map((item) => [item.code, item]));
    const missing = lines.find((line) => !found.has(line.item_code));
    if (missing) {
      throw new PrefillUnavailableError(`item ${missing.item_code}`);
    }
    const chosen = proposal.warehouse ?? this.bestWarehouse(warehouses, lines, found);
    this.start();
    this.warehouses.set(warehouses);
    if (customer) {
      this.selectCustomer(customer);
      if (project) {
        this.project.set({ id: project.id, title: project.title });
      }
    } else {
      this.useWalkIn();
    }
    this.lines.set(
      lines.map((line) => {
        const item = found.get(line.item_code)!;
        return {
          item,
          qty: line.qty,
          rate: lineRate(line, caps.editPrice, item.price),
          discount: 0,
        };
      }),
    );
    this.warehouse.set(warehouses.some((w) => w.id === chosen) ? chosen : null);
    this.prefill.set('filled');
    await this.loadOptions().catch(() => undefined);
    return 'opened';
  }

  prefillFailed(notice: 'expired' | 'unavailable' | 'busy'): void {
    if (notice === 'busy') {
      this.prefill.set(notice);
      return;
    }
    if (!this.openConfirmation()) {
      this.start();
      this.prefill.set(notice);
    }
  }

  /** Without a named warehouse: the one that holds the most of what is being sold, if it can supply every item. */
  private bestWarehouse(
    warehouses: WarehouseOption[],
    lines: { item_code: string; qty: number }[],
    items: Map<string, CatalogItem>,
  ): string | null {
    const supplies = warehouses
      .map((w) => ({
        id: w.id,
        covers: lines.every((line) => {
          const item = items.get(line.item_code)!;
          return !item.isStock || (item.stock[w.id] ?? 0) >= line.qty;
        }),
        held: lines.reduce((sum, line) => sum + (items.get(line.item_code)!.stock[w.id] ?? 0), 0),
      }))
      .filter((w) => w.covers)
      .sort((a, b) => b.held - a.held);
    return supplies[0]?.id ?? null;
  }

  async loadOptions(): Promise<void> {
    const business = await this.business.ensure();
    if (!business) {
      return;
    }
    const [warehouses, accounts] = await Promise.all([
      this.api.warehouses(business.name),
      this.api.paymentAccounts(business.name, this.session.capabilities().paymentModes),
    ]);
    this.warehouses.set(warehouses);
    this.accounts.set(accounts);
    if (!this.account() && accounts.length) {
      this.account.set(accounts[0]);
    }
  }

  async searchCustomers(term: string): Promise<CustomerOption[]> {
    const business = await this.business.ensure();
    return this.api.searchCustomers(term, business ?? undefined);
  }

  async searchItems(term: string, filter: CatalogFilter = 'all'): Promise<CatalogItem[]> {
    const business = await this.business.ensure();
    return this.api.searchItems(
      term,
      filter,
      business?.name ?? '',
      this.warehouses().map((w) => w.id),
    );
  }

  selectCustomer(customer: CustomerOption): void {
    if (this.project()) {
      return;
    }
    this.customerInactive.set(false);
    this.customer.set(customer);
    this.walkIn.set(false);
  }

  useWalkIn(): void {
    if (this.project()) {
      return;
    }
    this.customerInactive.set(false);
    this.customer.set(null);
    this.walkIn.set(true);
  }

  async addCustomer(customer: NewCustomer): Promise<CustomerOption> {
    const business = await this.business.ensure();
    const created = await this.api.createCustomer(customer, business?.country ?? '');
    this.selectCustomer(created);
    return created;
  }

  setWarehouse(id: string): void {
    this.warehouse.set(id);
  }

  add(item: CatalogItem): void {
    const lines = this.lines();
    const index = lines.findIndex((line) => line.item.code === item.code);
    if (index >= 0) {
      this.setQty(index, lines[index].qty + 1);
      return;
    }
    this.lines.set([...lines, { item, qty: 1, rate: item.price, discount: 0 }]);
  }

  setQty(index: number, qty: number): void {
    if (qty <= 0) {
      this.removeLine(index);
      return;
    }
    this.updateLine(index, { qty });
  }

  removeLine(index: number): void {
    this.lines.set(this.lines().filter((_, i) => i !== index));
  }

  updateLine(index: number, change: Partial<Pick<SaleLine, 'qty' | 'rate' | 'discount'>>): void {
    this.lines.set(this.lines().map((line, i) => (i === index ? { ...line, ...change } : line)));
  }

  /** Units of the item available in the sale's warehouse; Infinity for services. */
  available(item: CatalogItem, warehouse = this.warehouse()): number {
    return item.isStock ? (warehouse ? (item.stock[warehouse] ?? 0) : 0) : Infinity;
  }

  async saveDraft(): Promise<string> {
    const name = await this.api.saveDraft(await this.request(), this.draft());
    this.draft.set(name);
    return name;
  }

  async confirm(): Promise<void> {
    this.state.set('confirming');
    this.failure.set(null);
    try {
      const lines = this.lines();
      const result = await this.api.confirm(await this.request(), this.draft(), (name) =>
        this.draft.set(name),
      );
      this.finish(result, lines);
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.state.set('unresolved');
        return;
      }
      if (error instanceof PostedEarlierError) {
        // The earlier version stands in ERPNext. Confirming again is a deliberate new document.
        this.draft.set(null);
        this.reference.set(newReference('SALE'));
        this.failure.set('changed');
        this.state.set('failed');
        return;
      }
      this.fail(error);
    }
  }

  /** After an unresolved confirmation: found opens the result, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    this.state.set('checking');
    try {
      const lines = this.lines();
      const found = await this.api.find(await this.request());
      if (found === 'not-found' || 'draft' in found) {
        // Confirming again must submit the invoice the timed-out attempt already inserted, not a second one.
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(found, lines);
      return 'found';
    } catch {
      this.state.set('unresolved');
      return 'pending';
    }
  }

  private finish(result: SaleResult, lines: SaleLine[]): void {
    this.result.set(result);
    this.confirmedLines.set(lines);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
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

  private async request(): Promise<SaleRequest> {
    const business = await this.business.ensure();
    const customer = this.walkIn() ? await this.api.walkInCustomer() : (this.customer()?.id ?? '');
    return {
      reference: this.reference(),
      company: business?.name ?? '',
      customer,
      project: this.walkIn() ? null : (this.project()?.id ?? null),
      warehouse: this.warehouse() ?? '',
      lines: this.lines(),
      amountPaid: this.amountPaid() || 0,
      account: this.paymentStatus() === 'unpaid' ? null : this.account(),
    };
  }
}

/** Short, readable reference the user can quote while a confirmation is unresolved. */

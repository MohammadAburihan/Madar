import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { CatalogFilter, SalesApiService, WALK_IN_CUSTOMER } from './sales-api.service';
import {
  CatalogItem,
  CustomerOption,
  NewCustomer,
  PaymentAccount,
  PaymentStatus,
  SaleLine,
  SaleRequest,
  SaleResult,
  WarehouseOption,
  lineTotal,
  parseNumber,
  round2,
} from './sale.models';

export type ConfirmState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type ConfirmFailure = 'stock' | 'permission' | 'offline' | 'error';

/** One sale in progress, kept across the quick-sale steps until it is confirmed or discarded. */
@Injectable({ providedIn: 'root' })
export class QuickSaleStore {
  private readonly api = inject(SalesApiService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('SALE'));
  readonly customer = signal<CustomerOption | null>(null);
  readonly walkIn = signal(false);
  readonly warehouses = signal<WarehouseOption[]>([]);
  readonly warehouse = signal<string | null>(null);
  readonly lines = signal<SaleLine[]>([]);
  readonly paymentStatus = signal<PaymentStatus>('paid');
  readonly amountInput = signal('');
  readonly accounts = signal<PaymentAccount[]>([]);
  readonly account = signal<PaymentAccount | null>(null);
  readonly draft = signal<string | null>(null);
  readonly state = signal<ConfirmState>('idle');
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
    this.warehouse.set(null);
    this.lines.set([]);
    this.paymentStatus.set('paid');
    this.amountInput.set('');
    this.account.set(null);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
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
    this.customer.set(customer);
    this.walkIn.set(false);
  }

  useWalkIn(): void {
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
      this.lines.set(this.lines().filter((_, i) => i !== index));
      return;
    }
    this.updateLine(index, { qty });
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
      this.fail(error);
    }
  }

  /** After an unresolved confirmation: found opens the result, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
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
    const message = erpnextError.message.toLowerCase();
    this.failure.set(
      erpnextError.kind === 'forbidden'
        ? 'permission'
        : erpnextError.kind === 'offline'
          ? 'offline'
          : erpnextError.excType === 'NegativeStockError' ||
              /stock|insufficient|negative/.test(message)
            ? 'stock'
            : 'error',
    );
    this.state.set('failed');
  }

  private async request(): Promise<SaleRequest> {
    const business = await this.business.ensure();
    return {
      reference: this.reference(),
      company: business?.name ?? '',
      customer: this.walkIn() ? WALK_IN_CUSTOMER : (this.customer()?.id ?? ''),
      warehouse: this.warehouse() ?? '',
      lines: this.lines(),
      amountPaid: this.amountPaid() || 0,
      account: this.paymentStatus() === 'unpaid' ? null : this.account(),
    };
  }
}

/** Short, readable reference the user can quote while a confirmation is unresolved. */

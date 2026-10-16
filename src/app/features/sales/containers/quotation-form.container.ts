import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BusinessService } from '../../../core/business/business.service';
import {
  CustomerDirectoryService,
  CustomerOption,
} from '../../../core/customers/customer-directory.service';
import { formatMoney } from '../../../core/format/format';
import { parseNumber } from '../../../core/format/number';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { QuantityStepperComponent } from '../../../shared/ui/quantity-stepper.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { CatalogItem } from '../data-access/sale.models';
import { SalesApiService } from '../data-access/sales-api.service';
import { injectQuotationContext } from './quotation-context';

const SEARCH_DELAY_MS = 250;

/** "New quotation": the customer, the items with their quantities and prices, and how long it stays valid. */
@Component({
  selector: 'app-quotation-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    QuantityStepperComponent,
    SearchFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
    }

    .line app-text-field {
      flex: 1;
      min-inline-size: 140px;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/sales'])" />
    <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
    @if (!ctx.session.capabilities().sell) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      @if (ctx.store.customer(); as customer) {
        <app-person-card
          [title]="customer.name"
          [meta]="customer.meta"
          [balance]="txt.change"
          (picked)="ctx.store.setCustomer(null)"
        />
      } @else {
        <app-search-field
          [label]="txt.customer"
          [placeholder]="txt.searchCustomer"
          [(value)]="customerTerm"
        />
        @for (customer of customers(); track customer.id) {
          <app-person-card
            [title]="customer.name"
            [meta]="customerMeta(customer)"
            (picked)="chooseCustomer(customer)"
          />
        }
      }
      <app-search-field [label]="txt.items" [placeholder]="txt.searchItems" [(value)]="itemTerm" />
      @for (item of results(); track item.code) {
        <app-item-card
          [interactive]="true"
          [title]="item.name"
          [meta]="item.code"
          [detail]="price(item.price)"
          [kind]="item.isStock ? 'product' : 'service'"
          (selected)="addItem(item)"
        />
      }
      @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
        <app-item-card
          [title]="line.item.name"
          [meta]="lineMeta(line.qty, line.rate)"
          [detail]="price(line.qty * line.rate)"
          [kind]="line.item.isStock ? 'product' : 'service'"
        />
        <div class="line">
          <app-quantity-stepper
            [value]="line.qty"
            [label]="lineText(line.item.name).qty"
            [decreaseLabel]="lineText(line.item.name).decrease"
            [increaseLabel]="lineText(line.item.name).increase"
            (changed)="setQty(i, line.item.code, $event)"
          />
          <app-text-field
            [label]="lineText(line.item.name).rate"
            inputmode="decimal"
            [ltr]="true"
            [suffix]="ctx.currency()"
            [readonly]="!ctx.session.capabilities().editPrice"
            [value]="rateInputs()[line.item.code] ?? String(line.rate)"
            (valueChange)="setRate(i, line.item.code, $event)"
          />
        </div>
      }
      <app-text-field
        [label]="txt.validTill"
        type="date"
        [value]="ctx.store.validTill()"
        (valueChange)="ctx.store.setValidTill($event)"
      />
      <p class="total">{{ total() }}</p>
      <p class="muted">{{ txt.note }}</p>
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready() || ctx.store.savingDraft()"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : txt.confirm }}
      </button>
      <button
        type="button"
        class="md-btn"
        [disabled]="!ctx.store.complete() || ctx.store.busy() || ctx.store.savingDraft()"
        (click)="saveDraft()"
      >
        {{ ctx.store.savingDraft() ? txt.saving : txt.saveDraft }}
      </button>
    }
  `,
})
export class QuotationFormContainer implements OnInit {
  protected readonly ctx = injectQuotationContext();
  private readonly route = inject(ActivatedRoute);
  private readonly business = inject(BusinessService);
  private readonly customersApi = inject(CustomerDirectoryService);
  private readonly salesApi = inject(SalesApiService);
  protected readonly String = String;

  protected readonly customerTerm = signal('');
  protected readonly itemTerm = signal('');
  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly results = signal<CatalogItem[]>([]);
  protected readonly rateInputs = signal<Record<string, string>>({});
  private readonly notCreated = signal(false);
  private readonly draftSaved = signal<string | null>(null);
  private customerRun = 0;
  private itemRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sales.quote.back'),
      title: t('sales.quote.title'),
      customer: t('sales.quote.customer'),
      searchCustomer: t('sales.quote.searchCustomer'),
      change: t('sales.quote.change'),
      items: t('sales.quote.items'),
      searchItems: t('sales.quote.searchItems'),
      validTill: t('sales.quote.validTill'),
      note: t('sales.quote.note'),
      confirm: t('sales.quote.confirm'),
      confirming: t('sales.quote.confirming'),
      saveDraft: t('sales.quote.saveDraft'),
      saving: t('sales.quote.saving'),
      noAccess: {
        title: t('sales.records.noAccess.title'),
        message: t('sales.records.noAccess.message'),
      },
    };
  });

  protected readonly subtitle = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const draft = this.ctx.store.draft();
    const customer = this.ctx.store.customer()?.name ?? t('sales.quote.noCustomer');
    return draft ? t('sales.quote.subtitleDraft', { customer, draft }) : customer;
  });

  protected readonly total = computed(() =>
    this.ctx.i18n.tr().t('sales.quote.total', {
      amount: formatMoney(this.ctx.store.total(), this.ctx.currency()),
    }),
  );

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        tone: 'danger' as const,
        title: t(`sales.quote.failed.${failure}.title`),
        message: t(`sales.quote.failed.${failure}.message`),
      };
    }
    if (this.draftSaved()) {
      return {
        tone: 'tint' as const,
        title: t('sales.quote.draftSaved.title'),
        message: t('sales.quote.draftSaved.message', { draft: this.draftSaved() }),
      };
    }
    return this.notCreated() && this.ctx.store.state() === 'idle'
      ? {
          tone: 'warning' as const,
          title: t('sales.quote.notCreated.title'),
          message: t('sales.quote.notCreated.message'),
        }
      : null;
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.customerTerm();
      if (this.ctx.store.customer()) {
        return;
      }
      const timer = setTimeout(
        () => untracked(() => void this.searchCustomers(term)),
        SEARCH_DELAY_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });
    effect((onCleanup) => {
      const term = this.itemTerm();
      const timer = setTimeout(() => untracked(() => void this.searchItems(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown() && store.result()) {
      void this.ctx.openQuotation(store.result()!, { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed') {
      // Shown already (here by Back): this visit is a new quotation.
      store.start();
    }
    this.notCreated.set(this.route.snapshot.queryParamMap.has('notCreated'));
  }

  protected customerMeta(customer: CustomerOption): string | null {
    return [customer.phone, customer.city].filter(Boolean).join(' · ') || null;
  }

  protected chooseCustomer(customer: CustomerOption): void {
    this.ctx.store.setCustomer({
      id: customer.id,
      name: customer.name,
      meta: this.customerMeta(customer),
    });
    this.customerTerm.set('');
  }

  protected addItem(item: CatalogItem): void {
    // A new line starts at the listed price; a price typed for an earlier line of it doesn't carry over.
    if (!this.ctx.store.lines().some((l) => l.item.code === item.code)) {
      this.forgetRate(item.code);
    }
    this.ctx.store.addItem(item);
    this.itemTerm.set('');
    this.results.set([]);
  }

  protected setQty(index: number, code: string, qty: number): void {
    if (qty <= 0) {
      this.forgetRate(code);
    }
    this.ctx.store.setQty(index, qty);
  }

  private forgetRate(code: string): void {
    this.rateInputs.update(({ [code]: _, ...rest }) => rest);
  }

  protected setRate(index: number, code: string, input: string): void {
    this.rateInputs.update((inputs) => ({ ...inputs, [code]: input }));
    const rate = parseNumber(input);
    this.ctx.store.setRate(index, Number.isFinite(rate) && rate >= 0 ? rate : -1);
  }

  protected price(amount: number): string {
    return formatMoney(amount, this.ctx.currency());
  }

  protected lineMeta(qty: number, rate: number): string {
    return `${qty} × ${formatMoney(rate, this.ctx.currency())}`;
  }

  protected lineText(item: string) {
    const { t } = this.ctx.i18n.tr();
    return {
      qty: t('sales.quote.qty', { item }),
      decrease: t('sales.quote.decrease', { item }),
      increase: t('sales.quote.increase', { item }),
      rate: t('sales.quote.rate', { item }),
    };
  }

  protected async confirm(): Promise<void> {
    this.notCreated.set(false);
    this.draftSaved.set(null);
    await this.ctx.store.confirm();
    const store = this.ctx.store;
    if (store.state() === 'confirmed' && store.result()) {
      void this.ctx.openQuotation(store.result()!, { replaceUrl: true });
    } else if (store.state() === 'unresolved') {
      void this.ctx.go('checking');
    }
  }

  protected async saveDraft(): Promise<void> {
    this.notCreated.set(false);
    this.draftSaved.set(await this.ctx.store.saveDraft());
  }

  private async searchCustomers(term: string): Promise<void> {
    const run = ++this.customerRun;
    const found = await this.customersApi.search(term).catch(() => []);
    if (run === this.customerRun) {
      this.customers.set(found);
    }
  }

  private async searchItems(term: string): Promise<void> {
    const run = ++this.itemRun;
    if (!term.trim()) {
      this.results.set([]);
      return;
    }
    const business = await this.business.ensure().catch(() => null);
    if (!business) {
      return;
    }
    const found = await this.salesApi.searchItems(term, 'all', business.name, []).catch(() => []);
    if (run === this.itemRun) {
      this.results.set(found);
    }
  }
}

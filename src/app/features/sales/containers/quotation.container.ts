import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { formatMoney, formatShortDate, toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FileExportService } from '../../../core/platform/file-export.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { QuotationDetail } from '../data-access/quotation.models';
import { QuotationApiService } from '../data-access/quotation-api.service';
import { QuotationStore } from '../data-access/quotation.store';
import { SalesOrderApiService } from '../data-access/sales-order-api.service';
import { SalesOrderStore } from '../data-access/sales-order.store';
import { quotationHtml, quotationSummary } from './quotation-view';

/** One quotation: what was quoted and for how long, to share with the customer. */
@Component({
  selector: 'app-quotation',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/sales'])" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-feedback-card [title]="v.card.title" [message]="v.card.message" />
      @for (line of v.lines; track $index) {
        <app-item-card [title]="line.title" [meta]="line.meta" [detail]="line.detail" />
      }
      @if (v.validTill) {
        <p class="muted">{{ v.validTill }}</p>
      }
      @if (pdfFailed()) {
        <app-feedback-card
          tone="danger"
          [title]="txt.pdfFailed.title"
          [message]="txt.pdfFailed.message"
        />
      }
      @if (v.orderable && caps().sell) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="orderStore.busy()"
          (click)="createOrder(v.name)"
        >
          {{ ordering() ? txt.creatingOrder : txt.createOrder }}
        </button>
        @if (orderStore.busy() && orderStore.quotation() !== v.name) {
          <p class="muted">{{ txt.otherOrder }}</p>
        }
      }
      @if (orderNotice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
        @if (n.check) {
          <button
            type="button"
            class="md-btn"
            [disabled]="orderStore.state() !== 'unresolved'"
            (click)="checkOrder()"
          >
            {{ orderStore.state() === 'checking' ? txt.checkingNow : txt.check }}
          </button>
        }
      }
      @for (order of orders(); track order) {
        <button type="button" class="md-btn" (click)="openOrder(order)">
          {{ orders().length === 1 ? txt.openOrder : txt.openNamedOrder(order) }}
        </button>
      }
      @if (v.draft) {
        @if (caps().sell && v.editable) {
          <button type="button" class="md-btn md-btn--primary" (click)="edit()">
            {{ txt.edit }}
          </button>
        }
      } @else {
        <button type="button" class="md-btn" [disabled]="sharing()" (click)="share(v.name)">
          {{ sharing() ? txt.preparing : txt.share }}
        </button>
      }
      <button type="button" class="md-btn" (click)="router.navigate(['/sales'])">
        {{ txt.backToSales }}
      </button>
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" [subtitle]="name()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load(name())">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class QuotationContainer {
  readonly name = input.required<string>();

  private readonly api = inject(QuotationApiService);
  private readonly store = inject(QuotationStore);
  private readonly business = inject(BusinessService);
  private readonly files = inject(FileExportService);
  private readonly orderApi = inject(SalesOrderApiService);
  protected readonly orderStore = inject(SalesOrderStore);
  private readonly clock = inject(SiteClockService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  private readonly quotation = signal<QuotationDetail | null>(null);
  /** Just confirmed in this task: the page reads "Quotation confirmed". */
  private readonly justConfirmed = signal(false);
  protected readonly failed = signal(false);
  protected readonly sharing = signal(false);
  protected readonly pdfFailed = signal(false);
  /** Submitted sales orders made from this quotation. */
  protected readonly orders = signal<string[]>([]);
  private readonly today = signal<string | null>(null);
  /** "Check result" found that the timed-out order was never made. */
  private readonly orderNotMade = signal(false);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sales.quote.back'),
      title: t('sales.quote.pageTitle'),
      share: t('sales.quote.share'),
      edit: t('sales.quote.edit'),
      preparing: t('statements.preparing'),
      backToSales: t('sales.quote.backToSales'),
      createOrder: t('sales.quote.createOrder'),
      creatingOrder: t('sales.quote.creatingOrder'),
      otherOrder: t('sales.quote.otherOrder'),
      openOrder: t('sales.quote.openOrder'),
      openNamedOrder: (name: string) => t('sales.quote.openNamedOrder', { name }),
      check: t('sale.checking.check'),
      checkingNow: t('sale.checking.checkingNow'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      loadFailed: {
        title: t('sales.quote.loadFailed.title'),
        message: t('sales.quote.loadFailed.message'),
      },
      pdfFailed: {
        title: t('statements.pdfFailed.title'),
        message: t('statements.pdfFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const quotation = this.quotation();
    if (!quotation) {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const currency = this.business.active()?.currency ?? '';
    return {
      name: quotation.name,
      // A draft isn't sent to customers: it can be finished, not shared.
      draft: quotation.docstatus === 0,
      // ERPNext makes orders only from a customer's submitted quotation that is still valid and not fully ordered.
      orderable:
        quotation.docstatus === 1 &&
        quotation.forCustomer &&
        ['Open', 'Replied', 'Partially Ordered'].includes(quotation.status) &&
        (!quotation.validTill || (!!this.today() && quotation.validTill >= this.today()!)),
      editable: quotation.forCustomer,
      title: tr.t(this.justConfirmed() ? 'sales.quote.confirmedTitle' : 'sales.quote.pageTitle'),
      subtitle: tr.t('sales.quote.pageSubtitle', {
        name: quotation.name,
        customer: quotation.customerName,
      }),
      card: quotationSummary(quotation, currency, tr),
      lines: quotation.lines.map((l) => ({
        title: l.name,
        meta: `${l.qty} × ${formatMoney(l.rate, currency)}`,
        detail: formatMoney(l.amount, currency),
      })),
      validTill: quotation.validTill
        ? tr.t('sales.records.validUntil', { date: formatShortDate(quotation.validTill, language) })
        : null,
    };
  });

  constructor() {
    effect(() => {
      const name = this.name();
      untracked(() => {
        // The quotation this task just confirmed: show it as confirmed, once.
        const confirmed = this.store.result() === name && !this.store.resultShown();
        this.justConfirmed.set(confirmed);
        if (confirmed) {
          this.store.resultShown.set(true);
        }
        void this.load(name);
      });
    });
  }

  protected readonly ordering = computed(
    () => this.orderStore.state() === 'confirming' && this.orderStore.quotation() === this.name(),
  );

  protected readonly orderNotice = computed(() => {
    const { t } = this.i18n.tr();
    const store = this.orderStore;
    if (store.quotation() !== this.name()) {
      return null;
    }
    const state = store.state();
    if (state === 'unresolved' || state === 'checking') {
      return {
        tone: 'warning' as const,
        title: t('sales.quote.order.unresolved.title'),
        message: t('sales.quote.order.unresolved.message'),
        check: true,
      };
    }
    const failure = store.failure();
    if (state === 'failed' && failure) {
      return {
        tone: 'danger' as const,
        title: t(`sales.quote.order.failed.${failure}.title`),
        message: t(`sales.quote.order.failed.${failure}.message`),
        check: false,
      };
    }
    return this.orderNotMade() && state === 'idle'
      ? {
          tone: 'warning' as const,
          title: t('sales.quote.order.notMade.title'),
          message: t('sales.quote.order.notMade.message'),
          check: false,
        }
      : null;
  });

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.quotation.set(null);
    this.failed.set(false);
    this.orders.set([]);
    this.orderNotMade.set(false);
    try {
      await this.business.ensure();
      const quotation = await this.api.quotation(name);
      if (run === this.run) {
        this.quotation.set(quotation);
        void this.loadOrders(name, quotation, run);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  private async loadOrders(name: string, quotation: QuotationDetail, run: number): Promise<void> {
    if (quotation.docstatus !== 1) {
      return;
    }
    await this.clock.ensure().catch(() => undefined);
    if (run === this.run) {
      this.today.set(toIsoDate(this.clock.now()));
    }
    // Only a link to the order: the quotation still shows if the orders can't be read.
    const orders = await this.orderApi.ordersFor(name).catch(() => []);
    if (run === this.run) {
      this.orders.set(orders);
    }
  }

  protected async createOrder(name: string): Promise<void> {
    this.orderNotMade.set(false);
    await this.orderStore.create(name);
    this.followOrder(name);
  }

  protected async checkOrder(): Promise<void> {
    const name = this.orderStore.quotation();
    const outcome = await this.orderStore.checkResult();
    if (outcome === 'not-found' && name === this.name()) {
      this.orderNotMade.set(true);
    }
    if (name) {
      this.followOrder(name);
    }
  }

  /** The order made from the quotation still shown opens; one finished after leaving is listed instead. */
  private followOrder(quotation: string): void {
    const order = this.orderStore.result();
    if (this.orderStore.state() === 'confirmed' && order && quotation === this.name()) {
      void this.router.navigate(['/sales/orders', order]);
    }
  }

  protected openOrder(order: string): void {
    void this.router.navigate(['/sales/orders', order]);
  }

  protected edit(): void {
    const quotation = this.quotation();
    if (quotation) {
      // While another confirmation is open, the form shows that one first.
      this.store.edit(quotation);
      void this.router.navigate(['/sales/quote/new']);
    }
  }

  protected async share(name: string): Promise<void> {
    if (this.sharing()) {
      return;
    }
    this.sharing.set(true);
    this.pdfFailed.set(false);
    try {
      const quotation = this.quotation();
      if (!quotation || quotation.name !== name) {
        return;
      }
      const html = quotationHtml(
        quotation,
        this.business.active()?.name ?? '',
        this.business.active()?.currency ?? '',
        this.i18n.language(),
        this.i18n.tr(),
      );
      const blob = await this.api.pdf(html);
      await this.files.share(new File([blob], `${name}.pdf`, { type: 'application/pdf' }));
    } catch {
      this.pdfFailed.set(true);
    } finally {
      this.sharing.set(false);
    }
  }
}

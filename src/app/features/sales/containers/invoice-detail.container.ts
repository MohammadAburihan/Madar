import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { InvoiceApiService, InvoiceDetail } from '../data-access/invoice-api.service';
import { canContinueSale, invoiceView } from './invoice-view';

/** A sales invoice with its payment state and linked payments. */
@Component({
  selector: 'app-invoice-detail',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="text().back" (back)="back()" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @for (chip of v.chips; track chip.label) {
        <app-status-chip [label]="chip.label" [tone]="chip.tone" />
      }
      <app-totals-card [rows]="v.totals" />
      <app-feedback-card [title]="v.payments.title" [message]="v.payments.message" />
      @if (continuable()) {
        <button type="button" class="md-btn md-btn--primary" (click)="continueSale()">
          {{ text().continueSale }}
        </button>
      }
      <button
        type="button"
        class="md-btn"
        [class.md-btn--primary]="!continuable()"
        (click)="router.navigate(['/money'])"
      >
        {{ text().history }}
      </button>
      @if (caps().returnSales && invoice()?.returnable) {
        <button
          type="button"
          class="md-btn"
          (click)="router.navigate(['/sales/invoices', name(), 'return'])"
        >
          {{ text().returnItems }}
        </button>
      }
      <button type="button" class="md-btn" (click)="router.navigate(['/sales'])">
        {{ text().backToSales }}
      </button>
    } @else if (failed()) {
      <app-feedback-card
        tone="warning"
        [title]="text().notFound.title"
        [message]="text().notFound.message"
      />
    } @else {
      <p class="muted" role="status">{{ text().loading }}</p>
    }
  `,
})
export class InvoiceDetailContainer {
  readonly name = input.required<string>();
  /** The payment that led here, named in the subtitle ("After PAY-0156"). */
  readonly after = input<string | undefined>();

  private readonly api = inject(InvoiceApiService);
  private readonly business = inject(BusinessService);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly router = inject(Router);
  protected readonly i18n = injectI18n();
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private readonly session = inject(SessionService);
  protected readonly caps = this.session.capabilities;
  protected readonly invoice = signal<InvoiceDetail | null>(null);
  protected readonly failed = signal(false);

  protected readonly continuable = computed(() => {
    const invoice = this.invoice();
    return (
      !!invoice &&
      canContinueSale(invoice, {
        sell: this.caps().sell,
        company: this.business.active()?.name ?? '',
        owner: OWN_SALES_ONLY.includes(this.session.persona())
          ? (this.session.user()?.id ?? '')
          : null,
      })
    );
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sale.back'),
      history: t('invoice.history'),
      continueSale: t('invoice.continueSale'),
      backToSales: t('invoice.backToSales'),
      returnItems: t('sales.return.start'),
      loading: t('invoice.loading'),
      notFound: { title: t('invoice.notFound.title'), message: t('invoice.notFound.message') },
    };
  });

  protected readonly view = computed(() => {
    const invoice = this.invoice();
    return invoice
      ? invoiceView(
          invoice,
          this.after() ?? null,
          this.business.active()?.currency ?? '',
          this.i18n.language(),
          this.i18n.tr(),
        )
      : null;
  });

  constructor() {
    void this.business.ensure().catch(() => undefined);
    effect(() => {
      const name = this.name();
      this.invoice.set(null);
      this.failed.set(false);
      this.api
        .load(name)
        .then((invoice) => name === this.name() && this.invoice.set(invoice))
        .catch(() => name === this.name() && this.failed.set(true));
    });
  }

  protected continueSale(): void {
    void this.router.navigate(['/sales/new/basket'], { queryParams: { draft: this.name() } });
  }

  protected back(): void {
    if (history.length > 1) {
      history.back();
    } else {
      void this.router.navigate(['/sales']);
    }
  }
}

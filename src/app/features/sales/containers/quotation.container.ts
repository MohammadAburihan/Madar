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
import { formatMoney, formatShortDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FileExportService } from '../../../core/platform/file-export.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { QuotationDetail } from '../data-access/quotation.models';
import { QuotationApiService } from '../data-access/quotation-api.service';
import { QuotationStore } from '../data-access/quotation.store';
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
      @if (v.draft) {
        @if (caps().sell) {
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

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.quotation.set(null);
    this.failed.set(false);
    try {
      await this.business.ensure();
      const quotation = await this.api.quotation(name);
      if (run === this.run) {
        this.quotation.set(quotation);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
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

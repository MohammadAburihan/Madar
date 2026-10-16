import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  signal,
  untracked,
} from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectQuotationContext } from './quotation-context';

/** Shown when a confirmation timed out: the quotation may exist, so the user checks instead of resubmitting. */
@Component({
  selector: 'app-quotation-checking',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/sales'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    <app-feedback-card tone="warning" [title]="txt.cardTitle" [message]="txt.cardMessage" />
    <app-totals-card density="compact" [rows]="txt.rows" />
    <p class="muted">{{ txt.reference }}</p>
    @if (pending() || ctx.store.state() === 'confirming') {
      <p class="muted" role="status">{{ txt.pending }}</p>
    }
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="ctx.store.state() !== 'unresolved'"
      (click)="check()"
    >
      {{ ctx.store.state() === 'checking' ? txt.checkingNow : txt.check }}
    </button>
    <button type="button" class="md-btn" (click)="ctx.router.navigate(['/'])">
      {{ txt.home }}
    </button>
  `,
})
export class QuotationCheckingContainer implements OnInit {
  protected readonly ctx = injectQuotationContext();
  protected readonly pending = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const store = this.ctx.store;
    return {
      back: t('sale.back'),
      title: t('sales.quote.checking.title'),
      subtitle: store.customer()?.name ?? '',
      cardTitle: t('sales.quote.checking.cardTitle'),
      cardMessage: t('sales.quote.checking.cardMessage'),
      rows: [
        {
          label: t('sales.quote.checking.planned'),
          value: formatMoney(store.total(), this.ctx.currency()),
        },
      ],
      reference: t('sale.checking.reference', { reference: store.reference() }),
      pending: t('sale.checking.pending'),
      check: t('sale.checking.check'),
      checkingNow: t('sale.checking.checkingNow'),
      home: t('sale.checking.home'),
    };
  });

  constructor() {
    // Reached while a slow confirmation still runs: move on as soon as it settles.
    effect(() => {
      const state = this.ctx.store.state();
      if (state === 'confirmed' || state === 'failed') {
        untracked(() => this.ngOnInit());
      }
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (!store.busy()) {
      const result = store.result();
      void (result
        ? this.ctx.openQuotation(result, { replaceUrl: true })
        : this.ctx.go('', { replaceUrl: true }));
    }
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.ctx.store.checkResult();
    const result = this.ctx.store.result();
    if (outcome === 'found' && result) {
      void this.ctx.openQuotation(result, { replaceUrl: true });
    } else if (outcome === 'not-found') {
      void this.ctx.go('', { replaceUrl: true, queryParams: { notCreated: 1 } });
    } else {
      this.pending.set(true);
    }
  }
}

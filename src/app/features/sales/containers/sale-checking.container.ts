import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  signal,
  untracked,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { formatMoney } from '../../../core/format/format';
import { injectSaleContext } from './sale-context';

/** Shown when a confirmation timed out: the sale may exist, so the user checks instead of resubmitting. */
@Component({
  selector: 'app-sale-checking',
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
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    <app-feedback-card tone="warning" [title]="txt.cardTitle" [message]="txt.cardMessage" />
    <app-totals-card [rows]="txt.totals" />
    <p class="muted">{{ txt.reference }}</p>
    @if (pending() || ctx.store.state() === 'confirming') {
      <p class="muted" role="status">{{ txt.pending }}</p>
    }
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="checking() || ctx.store.state() !== 'unresolved'"
      (click)="check()"
    >
      {{ checking() ? txt.checkingNow : txt.check }}
    </button>
    <button type="button" class="md-btn" (click)="ctx.router.navigate(['/'])">
      {{ txt.home }}
    </button>
  `,
})
export class SaleCheckingContainer implements OnInit {
  protected readonly ctx = injectSaleContext();
  protected readonly pending = signal(false);
  protected readonly checking = computed(() => this.ctx.store.state() === 'checking');

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const money = (amount: number) => formatMoney(amount, this.ctx.currency());
    const store = this.ctx.store;
    return {
      back: t('sale.back'),
      title: t('sale.checking.title'),
      subtitle: `${this.ctx.businessName()} · ${this.ctx.customerLabel()}`,
      cardTitle: t('sale.checking.card.title'),
      cardMessage: t('sale.checking.card.message'),
      totals: [
        { label: t('sale.checking.plannedInvoice'), value: money(store.total()) },
        { label: t('sale.checking.plannedReceipt'), value: money(store.amountPaid() || 0) },
        { label: t('sale.checking.due'), value: money(store.outstanding()) },
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
        untracked(
          () =>
            void this.ctx.go(state === 'confirmed' ? 'receipt' : 'review', { replaceUrl: true }),
        );
      }
    });
  }

  ngOnInit(): void {
    if (!this.ctx.store.lines().length) {
      void this.ctx.go('');
    }
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.ctx.store.checkResult();
    if (outcome === 'found') {
      void this.ctx.go('receipt', { replaceUrl: true });
    } else if (outcome === 'not-found') {
      void this.ctx.go('review', { replaceUrl: true, queryParams: { notCreated: 1 } });
    } else {
      this.pending.set(true);
    }
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectCollectionContext } from './collection-context';

/** Shown when a confirmation timed out: the payment may exist, so the user checks instead of resubmitting. */
@Component({
  selector: 'app-collect-checking',
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
    @if (pending()) {
      <p class="muted" role="status">{{ txt.pending }}</p>
    }
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="ctx.store.state() === 'checking'"
      (click)="check()"
    >
      {{ ctx.store.state() === 'checking' ? txt.checkingNow : txt.check }}
    </button>
    <button type="button" class="md-btn" (click)="ctx.router.navigate(['/'])">
      {{ txt.home }}
    </button>
  `,
})
export class CollectCheckingContainer implements OnInit {
  protected readonly ctx = injectCollectionContext();
  protected readonly pending = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const store = this.ctx.store;
    const money = (amount: number) => formatMoney(amount, this.ctx.currency());
    return {
      back: t('sale.back'),
      title: t('collect.checkingTitle'),
      subtitle: [store.customer()?.name, ...store.allocations().map((a) => a.invoice)]
        .filter(Boolean)
        .join(' · '),
      cardTitle: t('collect.checkingCard.title'),
      cardMessage: t('collect.checkingCard.message'),
      totals: [
        { label: t('collect.plannedReceipt'), value: money(store.amount() || 0) },
        { label: t('collect.plannedDue'), value: money(store.dueAfter()) },
      ],
      reference: t('sale.checking.reference', { reference: store.reference() }),
      pending: t('sale.checking.pending'),
      check: t('sale.checking.check'),
      checkingNow: t('sale.checking.checkingNow'),
      home: t('sale.checking.home'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.busy()) {
      void this.ctx.go(this.ctx.store.result() ? 'recorded' : '', {
        replaceUrl: true,
        state: { edit: true },
      });
    }
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.ctx.store.checkResult();
    if (outcome === 'found') {
      void this.ctx.go('recorded', { replaceUrl: true });
    } else if (outcome === 'not-found') {
      void this.ctx.go('review', { replaceUrl: true, queryParams: { notCreated: 1 } });
    } else {
      this.pending.set(true);
    }
  }
}

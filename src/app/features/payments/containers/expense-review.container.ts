import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectExpenseContext } from './expense-context';
import { expenseReview } from './expense-view';

/** Step 2: what the expense records, before it is recorded. */
@Component({
  selector: 'app-expense-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.go('')" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.step" />
    @if (view(); as v) {
      <app-status-chip [label]="txt.ready" />
      <app-feedback-card [title]="txt.cardTitle" [message]="v.message" />
      <app-totals-card density="compact" [rows]="v.rows" />
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.recording : txt.record }}
      </button>
      <button
        type="button"
        class="md-btn"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="ctx.go('')"
      >
        {{ txt.edit }}
      </button>
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class ExpenseReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out expense was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectExpenseContext();
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('expense.reviewTitle'),
      step: t('expense.step2'),
      ready: t('expense.ready'),
      cardTitle: t('expense.cardTitle'),
      record: t('expense.record'),
      recording: t('expense.recording'),
      edit: t('expense.edit'),
      reference: t('purchase.review.reference', { reference: this.ctx.store.reference() }),
    };
  });

  protected readonly view = computed(() => {
    const summary = this.ctx.summary();
    return summary
      ? expenseReview(summary, this.ctx.currency(), this.ctx.i18n.language(), this.ctx.i18n.tr())
      : null;
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`expense.failed.${failure}.title`),
        message: t(`expense.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? { title: t('expense.notCreated.title'), message: t('expense.notCreated.message') }
      : null;
  });

  constructor() {
    effect(() => {
      const flag = !!this.notCreated();
      untracked(() => this.showNotCreated.set(flag));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.state() === 'unresolved' || store.state() === 'checking') {
      void this.ctx.go('checking', { replaceUrl: true });
    } else if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('recorded', { replaceUrl: true });
    } else if (store.state() !== 'confirming' && !store.ready()) {
      void this.ctx.go('', { replaceUrl: true });
    }
  }

  protected async confirm(): Promise<void> {
    this.showNotCreated.set(false);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('recorded', { replaceUrl: true });
    } else if (state === 'unresolved') {
      void this.ctx.go('checking', { replaceUrl: true });
    }
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { injectExpenseContext } from './expense-context';
import { expenseRecorded } from './expense-view';

/** Step 3: the recorded expense, where it was paid from, and how its receipt went. */
@Component({
  selector: 'app-expense-recorded',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @if (view(); as v) {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/money'])" />
      <app-page-heading [title]="txt.title" [subtitle]="v.subtitle" />
      <app-status-chip [label]="txt.recorded" />
      <app-feedback-card [title]="v.cardTitle" [message]="v.cardMessage" />
      <app-text-field [label]="txt.account" [value]="v.account" [readonly]="true" />
      <app-text-field [label]="txt.project" [value]="v.project" [readonly]="true" />
      @if (ctx.store.receiptState() === 'failed') {
        <button type="button" class="md-btn" (click)="ctx.store.attachReceipt()">
          {{ txt.retryReceipt }}
        </button>
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        (click)="ctx.router.navigate(['/money'])"
      >
        {{ txt.done }}
      </button>
      <button type="button" class="md-btn" (click)="another()">{{ txt.another }}</button>
    }
  `,
})
export class ExpenseRecordedContainer implements OnInit {
  protected readonly ctx = injectExpenseContext();

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('expense.recordedTitle'),
      recorded: t('expense.recorded'),
      account: t('expense.rows.account'),
      project: t('expense.rows.project'),
      retryReceipt: t('expense.retryReceipt'),
      done: t('expense.done'),
      another: t('expense.another'),
    };
  });

  protected readonly view = computed(() => {
    const name = this.ctx.store.result();
    const summary = this.ctx.summary();
    if (!name || !summary) {
      return null;
    }
    return {
      ...expenseRecorded(
        name,
        summary,
        this.ctx.store.receiptState(),
        this.ctx.currency(),
        this.ctx.i18n.language(),
        this.ctx.i18n.tr(),
      ),
      account: summary.account,
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }

  protected another(): void {
    this.ctx.store.start();
    void this.ctx.go('');
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { ReceiptPickerComponent } from '../components/receipt-picker.component';
import { injectExpenseContext } from './expense-context';

/** Step 1 of "Record expense": category, amount, date, account, an optional project and receipt photo. */
@Component({
  selector: 'app-expense-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    ReceiptPickerComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .pair {
      display: flex;
      gap: 12px;
    }

    .pair > * {
      flex: 1;
      min-inline-size: 0;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/money'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.step" />
    @if (!ctx.session.capabilities().recordExpenses) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (!ctx.store.loaded()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (!ctx.store.categories().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noCategories.title"
        [message]="txt.noCategories.message"
      />
    } @else if (!ctx.store.accounts().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccounts.title"
        [message]="txt.noAccounts.message"
      />
    } @else {
      <app-select-field
        [label]="txt.category"
        [options]="options().categories"
        [placeholder]="txt.chooseCategory"
        [value]="ctx.store.category()"
        (valueChange)="ctx.store.setCategory($event)"
      />
      <app-text-field
        [label]="txt.amount"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="ctx.currency()"
        [error]="amountError()"
        [value]="ctx.store.amountInput()"
        (valueChange)="ctx.store.setAmount($event)"
      />
      <div class="pair">
        <app-text-field
          [label]="txt.date"
          type="date"
          [value]="ctx.store.date()"
          (valueChange)="ctx.store.setDate($event)"
        />
        <app-select-field
          [label]="txt.account"
          [options]="options().accounts"
          [placeholder]="txt.chooseAccount"
          [value]="ctx.store.account()"
          (valueChange)="ctx.store.setAccount($event)"
        />
      </div>
      @if (ctx.store.projects().length) {
        <app-select-field
          [label]="txt.project"
          [options]="options().projects"
          [placeholder]="txt.noProject"
          [value]="ctx.store.project()"
          (valueChange)="ctx.store.setProject($event)"
        />
      }
      <app-receipt-picker
        [addLabel]="txt.addReceipt"
        [changeLabel]="txt.changeReceipt"
        [removeLabel]="txt.removeReceipt"
        [chosenLabel]="receiptLabel()"
        [fileName]="ctx.store.receipt()?.name ?? null"
        (picked)="ctx.store.setReceipt($event)"
        (removed)="ctx.store.setReceipt(null)"
      />
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready()"
        (click)="ctx.go('review')"
      >
        {{ txt.toReview }}
      </button>
    }
  `,
})
export class ExpenseFormContainer implements OnInit {
  protected readonly ctx = injectExpenseContext();
  protected readonly loadFailed = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sale.back'),
      title: t('expense.title'),
      step: t('expense.step1'),
      category: t('expense.category'),
      chooseCategory: t('expense.chooseCategory'),
      amount: t('expense.amount'),
      date: t('expense.date'),
      account: t('expense.account'),
      chooseAccount: t('expense.chooseAccount'),
      project: t('expense.project'),
      noProject: t('expense.noProject'),
      addReceipt: t('expense.addReceipt'),
      changeReceipt: t('expense.changeReceipt'),
      removeReceipt: t('expense.removeReceipt'),
      toReview: t('expense.toReview'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      noAccess: block('expense.noAccess'),
      loadFailed: block('expense.loadFailed'),
      noCategories: block('expense.noCategories'),
      noAccounts: block('expense.noAccounts'),
    };
  });

  protected readonly options = computed(() => ({
    categories: this.ctx.store.categories().map((c) => ({ value: c.account, label: c.name })),
    accounts: this.ctx.store.accounts().map((a) => ({ value: a.mode, label: a.label })),
    projects: this.ctx.store.projects().map((p) => ({ value: p.id, label: p.name })),
  }));

  protected readonly amountError = computed(() =>
    this.ctx.store.amountInput().trim() && !this.ctx.store.amountValid()
      ? this.ctx.i18n.tr().t('expense.amountError')
      : null,
  );

  protected readonly receiptLabel = computed(() => {
    const file = this.ctx.store.receipt();
    return file ? this.ctx.i18n.tr().t('expense.receiptChosen', { file: file.name }) : '';
  });

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go(store.state() === 'confirming' ? 'review' : 'checking', {
        replaceUrl: true,
      });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('recorded', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed') {
      // The expense was recorded and shown (here by Back): this visit is a new expense.
      store.start();
    }
    if (!store.loaded()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.ctx.store.load(this.ctx.session.capabilities().paymentModes);
    } catch {
      this.loadFailed.set(true);
    }
  }
}

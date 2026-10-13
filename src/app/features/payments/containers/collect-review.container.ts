import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { injectCollectionContext } from './collection-context';
import { allocationText, balanceCard } from './collection-view';

/** Step 2: what the payment records and where it goes, before it is confirmed. */
@Component({
  selector: 'app-collect-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @if (view(); as v) {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="v.back" (back)="ctx.go('')" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      <app-text-field [label]="v.receivedNow" [value]="v.amount" [readonly]="true" [ltr]="true" />
      <app-text-field [label]="v.allocateTo" [value]="v.allocation" [readonly]="true" />
      <app-text-field [label]="v.account" [value]="v.accountLabel" [readonly]="true" />
      <app-feedback-card [title]="v.balance.title" [message]="v.balance.message" />
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="ctx.store.confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? v.confirming : v.confirm }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.go('')">{{ v.edit }}</button>
    }
  `,
})
export class CollectReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out payment was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectCollectionContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const customer = store.customer();
    const allocations = store.allocations();
    if (!customer || !allocations.length) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const currency = this.ctx.currency();
    const amount = formatMoney(store.amount(), currency);
    return {
      back: t('sale.back'),
      title: t('collect.reviewTitle'),
      subtitle: [customer.name, ...allocations.map((a) => a.invoice)].join(' · '),
      receivedNow: t('collect.receivedNow'),
      amount,
      allocateTo: tr.plural('collect.allocateTo', allocations.length),
      allocation: allocationText(allocations, currency, tr),
      account: t('collect.account'),
      accountLabel: store.account()?.label ?? '',
      balance: balanceCard(store.selectedInvoices(), allocations, currency, tr),
      confirm: t('collect.confirm', { amount }),
      confirming: t('collect.confirming'),
      edit: t('collect.edit'),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      return {
        tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
        title: t(`collect.failed.${failure}.title`),
        message: t(`collect.failed.${failure}.message`),
      };
    }
    if (this.notCreated()) {
      return {
        tone: 'warning' as const,
        title: t('collect.notCreated.title'),
        message: t('collect.notCreated.message'),
      };
    }
    return null;
  });

  constructor() {
    effect(() => {
      const state = this.ctx.store.state();
      untracked(() => {
        if (state === 'confirmed') {
          void this.ctx.go('recorded', { replaceUrl: true });
        } else if (state === 'unresolved') {
          void this.ctx.go('checking', { replaceUrl: true });
        }
      });
    });
  }

  ngOnInit(): void {
    if (!this.ctx.store.ready() && this.ctx.store.state() !== 'failed') {
      void this.ctx.go('', { replaceUrl: true });
    }
  }
}

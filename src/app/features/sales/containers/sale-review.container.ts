import { NgTemplateOutlet } from '@angular/common';
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
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PaymentStatus } from '../data-access/sale.models';
import {
  createsMessage,
  panelLineView,
  servicesNote,
  stepSubtitle,
  totalsRows,
} from './quick-sale-view';
import { injectSaleContext } from './sale-context';

@Component({
  selector: 'app-sale-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    NgTemplateOutlet,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'ctx.desktop()', '[class.tablet]': "ctx.viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @if (ctx.desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.desktopSubtitle">
        <button type="button" class="md-btn" (click)="saveDraft()">{{ txt.saveDraft }}</button>
      </app-page-heading>
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <ng-container *ngTemplateOutlet="notices" />
      <div class="split">
        <div class="main">
          <ng-container *ngTemplateOutlet="payment" />
          <app-select-field
            [label]="txt.stock"
            [options]="supplyOptions()"
            [value]="ctx.store.warehouse()"
            (valueChange)="$event && ctx.store.setWarehouse($event)"
          />
          <app-feedback-card [title]="txt.createsDesktop" [message]="txt.creates" />
        </div>
        <div class="side">
          @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
            @let card = panelLine(i);
            <app-item-card
              [title]="card.title"
              [meta]="card.meta"
              [detail]="card.detail"
              [kind]="card.kind"
            />
          }
          <app-totals-card [rows]="totals()" />
          <ng-container *ngTemplateOutlet="confirmButton" />
        </div>
      </div>
    } @else {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="txt.back" (back)="ctx.go('basket')" />
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
      <ng-container *ngTemplateOutlet="notices" />
      <ng-container *ngTemplateOutlet="payment" />
      <app-totals-card [rows]="totals()" />
      <app-feedback-card [title]="txt.createsMobile" [message]="txt.creates" />
      @if (txt.servicesNote) {
        <p class="muted">{{ txt.servicesNote }}</p>
      }
      <ng-container *ngTemplateOutlet="confirmButton" />
      <button type="button" class="md-btn" (click)="saveDraft()">{{ txt.saveDraft }}</button>
    }

    <ng-template #payment>
      <app-select-field
        [label]="txt.status"
        [options]="txt.statusOptions"
        [value]="ctx.store.paymentStatus()"
        (valueChange)="setStatus($event)"
      />
      @if (ctx.store.paymentStatus() !== 'unpaid') {
        <app-text-field
          variant="amount"
          [label]="txt.amount"
          [suffix]="ctx.currency()"
          [readonly]="ctx.store.paymentStatus() === 'paid'"
          inputmode="decimal"
          [ltr]="true"
          [value]="amountValue()"
          (valueChange)="ctx.store.amountInput.set($event)"
          [error]="ctx.store.amountValid() ? null : txt.invalidAmount"
        />
        @if (accountOptions().length) {
          <app-select-field
            [label]="txt.account"
            [options]="accountOptions()"
            [value]="ctx.store.account()?.mode ?? null"
            (valueChange)="setAccount($event)"
          />
        } @else {
          <app-feedback-card
            tone="warning"
            [title]="txt.noAccount.title"
            [message]="txt.noAccount.message"
          />
        }
      }
    </ng-template>

    <ng-template #confirmButton>
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!canConfirm()"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : txt.confirm }}
      </button>
    </ng-template>

    <ng-template #notices>
      @if (failure(); as notice) {
        <app-feedback-card [tone]="notice.tone" [title]="notice.title" [message]="notice.message" />
      }
    </ng-template>
  `,
})
export class SaleReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out sale was never created. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectSaleContext();
  protected readonly draftSaved = signal<boolean | null>(null);

  protected readonly canConfirm = computed(() => {
    const store = this.ctx.store;
    const needsAccount = store.paymentStatus() !== 'unpaid';
    return (
      store.state() !== 'confirming' &&
      store.lines().length > 0 &&
      !!store.warehouse() &&
      store.amountValid() &&
      (!needsAccount || !!store.account())
    );
  });

  protected readonly amountValue = computed(() => {
    const store = this.ctx.store;
    return store.paymentStatus() === 'paid' ? store.total().toFixed(2) : store.amountInput();
  });

  protected readonly accountOptions = computed(() =>
    this.ctx.store.accounts().map((a) => ({ value: a.mode, label: a.label })),
  );

  protected readonly supplyOptions = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return this.ctx.store
      .warehouses()
      .map((w) => ({ value: w.id, label: t('sale.basket.supplyNow', { warehouse: w.name }) }));
  });

  protected readonly totals = computed(() =>
    totalsRows(
      {
        total: this.ctx.store.total(),
        paid: this.ctx.store.amountPaid() || 0,
        outstanding: this.ctx.store.outstanding(),
      },
      this.ctx.currency(),
      this.ctx.i18n.tr(),
    ),
  );

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const store = this.ctx.store;
    const currency = this.ctx.currency();
    return {
      back: t('sale.back'),
      title: t('sale.review.title'),
      subtitle: stepSubtitle(4, this.ctx.customerLabel(), tr),
      desktopSubtitle: t('sale.workspace.subtitle', {
        customer: this.ctx.customerLabel(),
        business: this.ctx.businessName(),
      }),
      saveDraft: t('sale.saveDraft'),
      status: t('sale.review.status'),
      statusOptions: (['paid', 'partial', 'unpaid'] as const).map((s) => ({
        value: s,
        label: t(`sale.review.${s}`),
      })),
      amount: t('sale.review.amount'),
      account: t('sale.review.account'),
      stock: t('sale.basket.stock'),
      invalidAmount: t('sale.review.invalidAmount'),
      noAccount: {
        title: t('sale.review.noAccount.title'),
        message: t('sale.review.noAccount.message'),
      },
      createsMobile: t('sale.review.createsMobile'),
      createsDesktop: t('sale.review.createsDesktop'),
      creates: createsMessage(
        {
          lines: store.lines(),
          status: store.paymentStatus(),
          total: store.total(),
          paid: store.amountPaid() || 0,
          outstanding: store.outstanding(),
          accountLabel: store.account()?.label ?? null,
          warehouseName: store.warehouseName(),
        },
        currency,
        tr,
      ),
      servicesNote: servicesNote(store.lines(), store.outstanding(), currency, tr),
      confirm: t('sale.review.confirm', { amount: formatMoney(store.total(), currency) }),
      confirming: t('sale.review.confirming'),
    };
  });

  protected readonly failure = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const saved = this.draftSaved();
    if (saved !== null) {
      return saved
        ? { tone: 'tint' as const, title: t('sale.draft.title'), message: t('sale.draft.message') }
        : { tone: 'danger' as const, title: t('sale.draft.failed'), message: '' };
    }
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      return {
        tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
        title: t(`sale.review.failed.${failure}.title`),
        message: t(`sale.review.failed.${failure}.message`),
      };
    }
    if (this.notCreated()) {
      return {
        tone: 'warning' as const,
        title: t('sale.review.notCreated.title'),
        message: t('sale.review.notCreated.message'),
      };
    }
    return null;
  });

  constructor() {
    effect(() => {
      const state = this.ctx.store.state();
      untracked(() => {
        if (state === 'confirmed') {
          void this.ctx.go('receipt', { replaceUrl: true });
        } else if (state === 'unresolved') {
          void this.ctx.go('checking', { replaceUrl: true });
        }
      });
    });
  }

  ngOnInit(): void {
    if (!this.ctx.store.hasCustomer() || !this.ctx.store.lines().length) {
      void this.ctx.go('');
      return;
    }
    if (!this.ctx.store.accounts().length) {
      void this.ctx.store.loadOptions().catch(() => undefined);
    }
  }

  protected panelLine(index: number) {
    return panelLineView(
      this.ctx.store.lines()[index],
      this.ctx.currency(),
      this.ctx.i18n.tr(),
      false,
    );
  }

  protected setStatus(status: string | null): void {
    if (status) {
      this.ctx.store.paymentStatus.set(status as PaymentStatus);
      this.draftSaved.set(null);
    }
  }

  protected setAccount(mode: string | null): void {
    this.ctx.store.account.set(this.ctx.store.accounts().find((a) => a.mode === mode) ?? null);
  }

  protected confirm(): void {
    this.draftSaved.set(null);
    void this.ctx.store.confirm();
  }

  protected async saveDraft(): Promise<void> {
    try {
      await this.ctx.store.saveDraft();
      this.draftSaved.set(true);
    } catch {
      this.draftSaved.set(false);
    }
  }
}

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
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectInvoiceContext } from './invoice-context';
import { billingCards, billingChip, invoiceFormHeading, invoiceTotals } from './invoice-view';

/** "Record supplier invoice" for one order: the supplier's number for the goods received and not billed. */
@Component({
  selector: 'app-invoice-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TextFieldComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.openOrder()" />
    <app-page-heading [title]="heading().title" [subtitle]="heading().subtitle" />
    @if (!ctx.session.capabilities().recordSupplierInvoices) {
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
    } @else if (!form()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (form()!.blocked; as reason) {
      <app-feedback-card
        tone="warning"
        [title]="txt.blockedTitle"
        [message]="txt.blocked[reason]"
      />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openOrder()">
        {{ txt.viewOrder }}
      </button>
    } @else if (!form()!.cards.length) {
      <app-feedback-card [title]="txt.nothingToBill.title" [message]="txt.nothingToBill.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openOrder()">
        {{ txt.viewOrder }}
      </button>
    } @else if (form(); as f) {
      <app-status-chip tone="warning" [label]="f.chip" />
      <app-text-field
        [label]="txt.billNo"
        autocomplete="off"
        [ltr]="true"
        [value]="ctx.store.billNo()"
        (valueChange)="ctx.store.setBillNo($event)"
      />
      @for (card of f.cards; track $index) {
        <app-item-card [title]="card.title" [meta]="card.meta" [detail]="card.detail" />
      }
      <app-totals-card density="compact" [rows]="f.totals" />
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        @if (ctx.store.failure() === 'changed') {
          <button type="button" class="md-btn" (click)="load()">{{ txt.reload }}</button>
        }
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready()"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.recording : txt.record }}
      </button>
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class InvoiceFormContainer implements OnInit {
  /** Set when "Check result" found that a timed-out invoice was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectInvoiceContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sale.back'),
      billNo: t('purchase.invoice.billNo'),
      record: t('purchase.invoice.record'),
      recording: t('purchase.invoice.recording'),
      reload: t('purchase.invoice.reload'),
      viewOrder: t('purchase.invoice.viewOrder'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      reference: t('purchase.review.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('purchase.invoice.noAccess'),
      loadFailed: block('purchase.detail.loadFailed'),
      nothingToBill: block('purchase.invoice.nothingToBill'),
      blockedTitle: t('purchase.invoice.blocked.title'),
      blocked: {
        sharedReceipt: t('purchase.invoice.blocked.sharedReceipt'),
        charges: t('purchase.invoice.blocked.charges'),
      },
    };
  });

  protected readonly heading = computed(() => {
    const order = this.ctx.store.order();
    const { t } = this.ctx.i18n.tr();
    return order
      ? invoiceFormHeading(order, this.ctx.i18n.tr())
      : { title: t('purchase.invoice.title'), subtitle: this.ctx.store.orderName() ?? '' };
  });

  protected readonly form = computed(() => {
    const preview = this.ctx.store.preview();
    if (!this.ctx.store.order() || !preview) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    return {
      blocked: preview.blocked,
      chip: billingChip(preview, tr),
      cards: billingCards(preview, tr),
      // Nothing is paid yet: a new invoice is outstanding in full.
      totals: invoiceTotals(preview.total, preview.total, preview.currency, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`purchase.invoice.failed.${failure}.title`),
        message: t(`purchase.invoice.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('purchase.invoice.notCreated.title'),
          message: t('purchase.invoice.notCreated.message'),
        }
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
    if (store.busy()) {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('done', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed') {
      // The invoice was posted and shown (here by Back): this visit is a new invoice for the order.
      store.start(store.orderName() ?? '');
    }
    if (!store.preview()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    const store = this.ctx.store;
    if (store.failure() === 'changed') {
      // ERPNext billed these receipts already: start a clean task so the preview shows what is left.
      store.start(store.orderName() ?? '');
    }
    try {
      await store.load();
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected async confirm(): Promise<void> {
    this.showNotCreated.set(false);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (state === 'unresolved') {
      void this.ctx.go('checking', { replaceUrl: true });
    }
  }
}

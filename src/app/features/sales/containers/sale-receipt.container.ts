import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { formatLongDate, formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { lineTotal } from '../data-access/sale.models';
import { paymentStatusOf, totalsRows } from './quick-sale-view';
import { injectSaleContext } from './sale-context';

@Component({
  selector: 'app-sale-receipt',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: './sale-page.scss',
  template: `
    @if (view(); as v) {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="v.back" (back)="ctx.router.navigate(['/'])" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @for (chip of v.chips; track chip.label) {
        <app-status-chip [label]="chip.label" [tone]="chip.tone" />
      }
      @if (v.paymentFailed) {
        <app-feedback-card
          tone="warning"
          [title]="v.paymentFailed.title"
          [message]="v.paymentFailed.message"
        />
      }
      @for (line of v.lines; track $index) {
        <app-item-card
          [title]="line.title"
          [meta]="line.meta"
          [detail]="line.detail"
          [kind]="line.kind"
        />
      }
      <app-totals-card [rows]="v.totals" />
      <p class="muted">{{ v.footer }}</p>
      @if (shared()) {
        <p class="muted" role="status">{{ v.shared }}</p>
      }
      <button type="button" class="md-btn md-btn--primary" (click)="share(v.shareText)">
        {{ v.share }}
      </button>
      <button type="button" class="md-btn" (click)="another()">{{ v.another }}</button>
    }
  `,
})
export class SaleReceiptContainer implements OnInit {
  protected readonly ctx = injectSaleContext();
  protected readonly shared = signal(false);

  protected readonly view = computed(() => {
    const result = this.ctx.store.result();
    if (!result) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const currency = this.ctx.currency();
    const money = (amount: number) => formatMoney(amount, currency);
    const lines = this.ctx.store.confirmedLines();
    const status = paymentStatusOf(result.paid, result.total);
    const account = this.ctx.store.account()?.label ?? '';
    const hasGoods = lines.some((line) => line.item.isStock);
    const [y, m, d] = result.postingDate.split('-').map(Number);
    const date = formatLongDate(new Date(y, m - 1, d), this.ctx.i18n.language());
    return {
      back: t('sale.back'),
      title: t('sale.receipt.title'),
      subtitle: `${result.invoice} · ${this.ctx.customerLabel()}`,
      chips: [
        { label: t('sale.receipt.invoice'), tone: 'tint' as const },
        {
          label: t(`sale.receipt.payment.${status}`),
          tone:
            status === 'paid'
              ? ('tint' as const)
              : status === 'partial'
                ? ('warning' as const)
                : ('danger' as const),
        },
        ...(hasGoods ? [{ label: t('sale.receipt.goods'), tone: 'tint' as const }] : []),
      ],
      paymentFailed: result.paymentFailed
        ? {
            title: t('sale.receipt.paymentFailed.title'),
            message: t('sale.receipt.paymentFailed.message'),
          }
        : null,
      lines: lines.map((line) => ({
        title: t('sale.receipt.lineTitle', { qty: line.qty, item: line.item.name }),
        meta: line.item.isStock ? this.ctx.store.warehouseName() : t('sale.receipt.serviceMeta'),
        detail: money(lineTotal(line)),
        kind: line.item.isStock ? ('product' as const) : ('service' as const),
      })),
      totals: totalsRows(result, currency, tr),
      footer: [
        result.payment ? t('sale.receipt.receiptLine', { payment: result.payment, account }) : null,
        t('sale.receipt.businessLine', { business: this.ctx.businessName(), date }),
      ]
        .filter(Boolean)
        .join('\n'),
      share: t('sale.receipt.share'),
      another: t('sale.receipt.another'),
      shared: t('sale.receipt.shared'),
      shareText: t('sale.receipt.shareText', {
        business: this.ctx.businessName(),
        invoice: result.invoice,
        total: money(result.total),
        paid: money(result.paid),
        outstanding: money(result.outstanding),
      }),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('');
    }
  }

  protected async share(text: string): Promise<void> {
    const plain = text.replace(/[⁨⁩]/g, '');
    try {
      if (navigator.share) {
        await navigator.share({ text: plain });
        return;
      }
      await navigator.clipboard.writeText(plain);
      this.shared.set(true);
    } catch {
      // The user closed the share sheet; nothing to do.
    }
  }

  protected another(): void {
    this.ctx.store.start();
    void this.ctx.go('');
  }
}

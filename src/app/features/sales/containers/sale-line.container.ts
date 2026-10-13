import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { lineTotal } from '../data-access/sale.models';
import { injectSaleContext } from './sale-context';

/** Price & discount for one line, limited by the role (docs/PERMISSIONS.md). */
@Component({
  selector: 'app-sale-line',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: './sale-page.scss',
  template: `
    @if (line(); as l) {
      @let txt = text();
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="txt.back" (back)="close()" />
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
      <app-text-field
        [label]="txt.quantity"
        inputmode="numeric"
        [ltr]="true"
        [(value)]="qty"
        [error]="errors().qty"
      />
      <app-text-field
        [label]="txt.price"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="ctx.currency()"
        [readonly]="!canEditPrice()"
        [(value)]="price"
        [error]="errors().price"
      />
      @if (!canEditPrice()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.locked.title"
          [message]="txt.locked.message"
        />
      }
      <app-text-field
        [label]="txt.discount"
        inputmode="decimal"
        [ltr]="true"
        suffix="%"
        [(value)]="discount"
        [error]="errors().discount"
        [hint]="txt.discountHint"
      />
      <app-feedback-card [title]="txt.lineTotal" [message]="txt.detail" />
      <button type="button" class="md-btn md-btn--primary" (click)="apply()">
        {{ txt.apply }}
      </button>
      <button type="button" class="md-btn" (click)="close()">{{ txt.cancel }}</button>
    }
  `,
})
export class SaleLineContainer implements OnInit {
  readonly index = input.required<string>();

  protected readonly ctx = injectSaleContext();
  protected readonly qty = signal('');
  protected readonly price = signal('');
  protected readonly discount = signal('');
  private readonly submitted = signal(false);

  protected readonly line = computed(() => this.ctx.store.lines()[Number(this.index())] ?? null);
  protected readonly canEditPrice = computed(() => this.ctx.session.capabilities().editPrice);
  private readonly maxDiscount = computed(() => this.ctx.session.capabilities().maxDiscount);

  private readonly parsed = computed(() => ({
    qty: Number(this.qty()),
    price: Number(this.price().replace(/,/g, '')),
    discount: Number(this.discount() || 0),
  }));

  protected readonly errors = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const { qty, price, discount } = this.parsed();
    if (!this.submitted()) {
      return { qty: null, price: null, discount: null };
    }
    return {
      qty: Number.isInteger(qty) && qty > 0 ? null : t('sale.line.invalidQty'),
      price: price > 0 ? null : t('sale.line.invalidPrice'),
      discount:
        discount >= 0 && discount <= this.maxDiscount()
          ? null
          : t('sale.line.invalidDiscount', { max: this.maxDiscount() }),
    };
  });

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const line = this.line()!;
    const { qty, price, discount } = this.parsed();
    const valid = qty > 0 && price > 0 && discount >= 0;
    const total = valid ? lineTotal({ qty, rate: price, discount }) : 0;
    const money = (amount: number) => formatMoney(amount, this.ctx.currency());
    return {
      back: t('sale.back'),
      title: t('sale.line.title'),
      subtitle: `${line.item.name} · ${line.item.code} · ${t(`home.role.${this.ctx.session.persona()}`)}`,
      quantity: t('sale.line.quantity'),
      price: t('sale.line.price'),
      discount: t('sale.line.discount'),
      discountHint:
        this.maxDiscount() < 100 ? t('sale.line.discountLimit', { max: this.maxDiscount() }) : null,
      locked: {
        title: t('sale.line.priceLocked.title'),
        message: t('sale.line.priceLocked.message'),
      },
      lineTotal: t('sale.line.lineTotal', { amount: money(total) }),
      detail:
        discount > 0
          ? t('sale.line.detailDiscount', { qty: qty || 0, price: money(price || 0), discount })
          : t('sale.line.detail', { qty: qty || 0, price: money(price || 0) }),
      apply: t('sale.line.apply'),
      cancel: t('sale.cancel'),
    };
  });

  ngOnInit(): void {
    const line = this.line();
    if (!line) {
      void this.ctx.go(this.ctx.store.hasCustomer() ? 'items' : '');
      return;
    }
    this.qty.set(String(line.qty));
    this.price.set(line.rate.toFixed(2));
    this.discount.set(line.discount ? String(line.discount) : '0');
  }

  protected apply(): void {
    this.submitted.set(true);
    const errors = this.errors();
    if (errors.qty || errors.price || errors.discount) {
      return;
    }
    const { qty, price, discount } = this.parsed();
    const index = Number(this.index());
    const line = this.line()!;
    this.ctx.store.updateLine(index, {
      qty,
      rate: this.canEditPrice() ? price : line.rate,
      discount,
    });
    if (qty > this.ctx.store.available(line.item)) {
      void this.ctx.go(`stock/${index}`, { queryParams: { qty }, replaceUrl: true });
      return;
    }
    this.close();
  }

  protected close(): void {
    void this.ctx.go(this.ctx.desktop() ? 'items' : 'basket');
  }
}

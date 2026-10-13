import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { parseNumber } from '../data-access/sale.models';
import { injectSaleContext } from './sale-context';

/** Requested quantity exceeds the warehouse's stock: use what's there, or move the sale to another warehouse. */
@Component({
  selector: 'app-sale-stock-check',
  imports: [
    BackLinkComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
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
        [label]="txt.requested"
        inputmode="numeric"
        [ltr]="true"
        [(value)]="requested"
        [error]="txt.error"
      />
      @if (otherOptions().length) {
        <app-select-field [label]="txt.other" [options]="otherOptions()" [(value)]="other" />
      } @else {
        <p class="muted">{{ txt.noneElsewhere }}</p>
      }
      @if (available() > 0) {
        <button type="button" class="md-btn md-btn--primary" (click)="useAvailable()">
          {{ txt.use }}
        </button>
      }
      @if (otherOptions().length) {
        <button type="button" class="md-btn" [disabled]="!other()" (click)="chooseOther()">
          {{ txt.choose }}
        </button>
      }
      <p class="muted">{{ txt.note }}</p>
    }
  `,
})
export class SaleStockCheckContainer implements OnInit {
  readonly index = input.required<string>();
  readonly qty = input<string | undefined>();

  protected readonly ctx = injectSaleContext();
  protected readonly requested = signal('');
  protected readonly other = signal<string | null>(null);

  protected readonly line = computed(() => this.ctx.store.lines()[Number(this.index())] ?? null);
  protected readonly available = computed(() => {
    const line = this.line();
    return line ? this.ctx.store.available(line.item) : 0;
  });

  protected readonly otherOptions = computed(() => {
    const line = this.line();
    const { t } = this.ctx.i18n.tr();
    if (!line) {
      return [];
    }
    return this.ctx.store
      .warehouses()
      .filter((w) => w.id !== this.ctx.store.warehouse() && (line.item.stock[w.id] ?? 0) > 0)
      .map((w) => ({
        value: w.id,
        label: t('sale.stock.otherOption', { warehouse: w.name, count: line.item.stock[w.id] }),
      }));
  });

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const line = this.line()!;
    const warehouse = this.ctx.store.warehouseName() ?? '';
    const count = this.available();
    return {
      back: t('sale.back'),
      title: t('sale.stock.title'),
      subtitle: `${line.item.name} · ${warehouse}`,
      requested: t('sale.stock.requested'),
      error:
        count === 0
          ? t('sale.stock.errorNone', { warehouse })
          : parseNumber(this.requested()) > count
            ? t('sale.stock.error', { count, warehouse })
            : null,
      other: t('sale.stock.other'),
      noneElsewhere: t('sale.stock.noneElsewhere'),
      use: t('sale.stock.use', { count, warehouse }),
      choose: t('sale.stock.choose'),
      note: t('sale.stock.note'),
    };
  });

  ngOnInit(): void {
    const line = this.line();
    if (!line) {
      void this.ctx.go(this.ctx.store.hasCustomer() ? 'items' : '');
      return;
    }
    this.requested.set(this.qty() ?? String(line.qty));
    this.other.set(this.otherOptions()[0]?.value ?? null);
  }

  protected useAvailable(): void {
    this.ctx.store.setQty(Number(this.index()), this.available());
    this.close();
  }

  protected chooseOther(): void {
    const target = this.other();
    if (!target) {
      return;
    }
    this.ctx.store.setWarehouse(target);
    const wanted = Math.max(1, Math.floor(parseNumber(this.requested())) || 1);
    this.ctx.store.setQty(Number(this.index()), Math.min(wanted, this.available()));
    this.close();
  }

  protected close(): void {
    const line = this.line();
    // A line added straight into a shortage (0 available) is dropped rather than left unsellable.
    if (line && this.available() === 0) {
      this.ctx.store.setQty(Number(this.index()), 0);
    } else if (line && line.qty > this.available()) {
      this.ctx.store.setQty(Number(this.index()), this.available());
    }
    void this.ctx.go(this.ctx.desktop() ? 'items' : 'basket');
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  signal,
  untracked,
} from '@angular/core';
import { parseNumber } from '../../../core/format/number';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { QuantityStepperComponent } from '../../../shared/ui/quantity-stepper.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PurchaseItem } from '../data-access/purchase.models';
import { injectPurchaseContext } from './purchase-context';
import { itemResult, lineRows } from './purchase-view';

const SEARCH_DELAY_MS = 250;

/** Step 1 of "New purchase order": the supplier, then the items with their quantities and prices. */
@Component({
  selector: 'app-purchase-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    QuantityStepperComponent,
    SearchFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
    }

    .line app-text-field {
      flex: 1;
      min-inline-size: 140px;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/purchases'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.step" />
    @if (!ctx.session.capabilities().orderPurchases) {
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
    } @else if (loaded() && !ctx.store.suppliers().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noSuppliers.title"
        [message]="txt.noSuppliers.message"
      />
    } @else {
      <app-select-field
        [label]="txt.supplier"
        [options]="supplierOptions()"
        [placeholder]="txt.chooseSupplier"
        [value]="ctx.store.supplier()"
        (valueChange)="ctx.store.setSupplier($event)"
      />
      @if (ctx.store.supplier()) {
        <app-filter-chips [label]="txt.kind" [options]="txt.kinds" [(value)]="kind" />
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        @for (item of visibleResults(); track item.code) {
          @let card = resultCard(item);
          <app-item-card
            [interactive]="true"
            [title]="card.title"
            [meta]="card.meta"
            [detail]="card.detail"
            [kind]="card.kind"
            (selected)="ctx.store.addItem(item)"
          />
        } @empty {
          @if (!searching() && (term().trim() || !ctx.store.lines().length)) {
            <p class="muted">{{ txt.noResults }}</p>
          }
        }
        @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
          <div class="line">
            <app-quantity-stepper
              [value]="line.qty"
              [label]="lineText(line.item.name).qty"
              [decreaseLabel]="lineText(line.item.name).decrease"
              [increaseLabel]="lineText(line.item.name).increase"
              (changed)="ctx.store.setQty(i, $event)"
            />
            <app-text-field
              [label]="txt.rate + ' · ' + line.item.name"
              inputmode="decimal"
              [ltr]="true"
              [suffix]="ctx.currency()"
              [value]="rateInputs()[line.item.code] ?? String(line.rate)"
              (valueChange)="setRate(i, line.item.code, $event)"
            />
          </div>
        }
        @if (ctx.store.lines().length) {
          <app-totals-card density="compact" [rows]="lines()" />
        }
      } @else {
        <p class="muted">{{ txt.supplierFirst }}</p>
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready()"
        (click)="ctx.go('review')"
      >
        {{ txt.review }}
      </button>
    }
  `,
})
export class PurchaseFormContainer implements OnInit {
  protected readonly ctx = injectPurchaseContext();
  protected readonly String = String;
  protected readonly term = signal('');
  protected readonly kind = signal<string>('product');
  protected readonly results = signal<PurchaseItem[]>([]);
  protected readonly searching = signal(true);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  /** What the user typed in each price field, so "4." isn't rewritten to "4" while typing. */
  protected readonly rateInputs = signal<Record<string, string>>({});
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.form.title'),
      step: t('purchase.form.step'),
      supplier: t('purchase.form.supplier'),
      chooseSupplier: t('purchase.form.chooseSupplier'),
      kind: t('purchase.form.kind'),
      kinds: [
        { value: 'product', label: t('purchase.form.products') },
        { value: 'service', label: t('purchase.form.services') },
      ],
      search: t('purchase.form.search'),
      placeholder: t('purchase.form.placeholder'),
      supplierFirst: t('purchase.form.supplierFirst'),
      noResults: t('purchase.form.noResults'),
      rate: t('purchase.form.rate'),
      review: t('purchase.form.review'),
      retry: t('purchase.retry'),
      noAccess: { title: t('purchase.noAccess.title'), message: t('purchase.noAccess.message') },
      loadFailed: {
        title: t('purchase.form.loadFailed.title'),
        message: t('purchase.form.loadFailed.message'),
      },
      noSuppliers: {
        title: t('purchase.form.noSuppliers.title'),
        message: t('purchase.form.noSuppliers.message'),
      },
    };
  });

  protected readonly supplierOptions = computed(() =>
    this.ctx.store.suppliers().map((s) => ({
      value: s.id,
      label: s.city ? `${s.name} · ${s.city}` : s.name,
    })),
  );

  /** Once the order has lines, results show only while searching, so the lines stay in view. */
  protected readonly visibleResults = computed(() =>
    this.term().trim() || !this.ctx.store.lines().length ? this.results() : [],
  );

  protected readonly lines = computed(() => lineRows(this.ctx.store.lines(), this.ctx.currency()));

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      const kind = this.kind() as 'product' | 'service';
      const supplier = this.ctx.store.supplier();
      if (!this.loaded() || !supplier) {
        return;
      }
      const timer = setTimeout(() => untracked(() => this.search(term, kind)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go(store.state() === 'confirming' ? 'review' : 'checking', {
        replaceUrl: true,
      });
      return;
    }
    if (store.state() === 'confirmed') {
      if (!store.resultShown() && store.result()) {
        void this.ctx.openOrder(store.result()!, { replaceUrl: true });
        return;
      }
      store.start();
    }
    void this.load();
  }

  protected resultCard(item: PurchaseItem) {
    return itemResult(item, this.ctx.currency(), this.ctx.i18n.tr());
  }

  protected lineText(item: string) {
    const { t } = this.ctx.i18n.tr();
    return {
      qty: t('purchase.form.qty', { item }),
      decrease: t('purchase.form.decrease', { item }),
      increase: t('purchase.form.increase', { item }),
    };
  }

  protected setRate(index: number, code: string, input: string): void {
    this.rateInputs.update((inputs) => ({ ...inputs, [code]: input }));
    const rate = parseNumber(input);
    this.ctx.store.setRate(index, Number.isFinite(rate) && rate >= 0 ? rate : -1);
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.ctx.store.loadSuppliers();
    } catch {
      this.loadFailed.set(true);
      return;
    }
    this.loaded.set(true);
  }

  private async search(term: string, kind: 'product' | 'service'): Promise<void> {
    const run = ++this.searchRun;
    this.searching.set(true);
    try {
      const results = await this.ctx.store.searchItems(term, kind);
      if (run === this.searchRun) {
        this.results.set(results);
      }
    } catch {
      if (run === this.searchRun) {
        this.results.set([]);
      }
    } finally {
      if (run === this.searchRun) {
        this.searching.set(false);
      }
    }
  }
}

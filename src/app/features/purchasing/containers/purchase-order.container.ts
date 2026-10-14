import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { formatMoney } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PurchaseApiService } from '../data-access/purchase-api.service';
import { OrderDetail } from '../data-access/purchase.models';
import { PurchaseOrderStore } from '../data-access/purchase-order.store';
import { detailLineCard, detailStats, progressChip } from './purchase-view';
import { receiveAction, receivedLineCard } from './receipt-view';

/** One purchase order: what was ordered, how much has arrived, and the total. */
@Component({
  selector: 'app-purchase-order',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatCardComponent,
    StatusChipComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="workspace()" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @for (chip of v.chips; track chip.label) {
        <app-status-chip [label]="chip.label" [tone]="chip.tone" />
      }
      @if (!v.received) {
        <app-text-field [label]="txt.supplier" [value]="v.supplier" [readonly]="true" />
      }
      @for (card of v.cards; track $index) {
        <app-item-card
          [title]="card.title"
          [meta]="card.meta"
          [detail]="card.detail"
          [kind]="card.kind"
        />
      }
      @if (!v.received) {
        <app-stat-card [stats]="v.stats" />
      }
      <app-totals-card density="compact" [rows]="v.total" />
      @if (!v.received) {
        <p class="muted">{{ txt.note }}</p>
      }
      @if (v.receive) {
        <button type="button" class="md-btn md-btn--primary" (click)="receive()">
          {{ v.receive }}
        </button>
      }
      @if (!v.received) {
        <button type="button" class="md-btn" (click)="workspace()">{{ txt.workspace }}</button>
      }
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load(name())">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class PurchaseOrderContainer {
  readonly name = input.required<string>();

  private readonly api = inject(PurchaseApiService);
  private readonly store = inject(PurchaseOrderStore);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly caps = inject(SessionService).capabilities;
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.detail.title'),
      supplier: t('purchase.detail.supplier'),
      note: t('purchase.detail.note'),
      workspace: t('purchase.detail.workspace'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      loadFailed: {
        title: t('purchase.detail.loadFailed.title'),
        message: t('purchase.detail.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const order = this.order();
    if (!order) {
      return null;
    }
    const tr = this.i18n.tr();
    const currency = this.business.active()?.currency ?? '';
    const receive = this.caps().receiveGoods ? receiveAction(order, tr) : null;
    if (order.receivedQty > 0) {
      // After the first receipt the page reads like the received-order mock: order and delivery status.
      const full = order.receivedQty >= order.orderedQty;
      return {
        received: true,
        title: tr.t('purchase.detail.titleWith', { order: order.name }),
        subtitle: tr.t('purchase.detail.receivedSubtitle', {
          supplier: order.supplierName,
          business: this.business.active()?.name ?? '',
        }),
        chips: [
          { label: tr.t('purchase.detail.orderConfirmed'), tone: 'tint' as const },
          {
            label: tr.t(full ? 'purchase.detail.deliveryFull' : 'purchase.detail.deliveryPartial'),
            tone: full ? ('tint' as const) : ('warning' as const),
          },
        ],
        supplier: order.supplierName,
        cards: order.lines.map((l) => receivedLineCard(l, tr)),
        stats: [],
        total: [
          { label: tr.t('purchase.detail.orderValue'), value: formatMoney(order.total, currency) },
        ],
        receive,
      };
    }
    return {
      received: false,
      title: tr.t('purchase.detail.title'),
      subtitle: tr.t('purchase.detail.subtitle', {
        order: order.name,
        supplier: order.supplierName,
      }),
      chips: [progressChip(order.progress, tr)],
      supplier: order.supplierName,
      cards: order.lines.map((l) => detailLineCard(l, currency, tr)),
      stats: detailStats(order, tr),
      total: [
        {
          label: tr.t('purchase.detail.total'),
          value: formatMoney(order.total, currency),
          accent: true,
        },
      ],
      receive,
    };
  });

  constructor() {
    effect(() => {
      const name = this.name();
      untracked(() => void this.load(name));
    });
  }

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.order.set(null);
    this.failed.set(false);
    if (this.store.result() === name) {
      this.store.resultShown.set(true);
    }
    try {
      await this.business.ensure();
      const order = await this.api.order(name);
      if (run === this.run) {
        this.order.set(order);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  protected receive(): void {
    void this.router.navigate(['/purchases/order', this.name(), 'receive']);
  }

  protected workspace(): void {
    void this.router.navigate(['/purchases']);
  }
}

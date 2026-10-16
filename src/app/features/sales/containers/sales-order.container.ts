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
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { SalesOrderApiService } from '../data-access/sales-order-api.service';
import { SalesOrderDetail, orderOpen, toDeliver } from '../data-access/sales-order.models';
import { orderChips, orderHeading, orderLineCard } from './sales-order-view';

/** One sales order: how far it is delivered and invoiced, and when the customer expects it. */
@Component({
  selector: 'app-sales-order',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/sales'])" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @for (chip of v.chips; track chip.label) {
        <app-status-chip [label]="chip.label" [tone]="chip.tone" />
      }
      @for (line of v.goods; track $index) {
        <app-item-card [title]="line.title" [meta]="line.meta" [detail]="line.detail" />
      }
      <app-text-field
        [label]="txt.expected"
        type="date"
        [readonly]="!v.editable"
        [error]="dateInvalid() ? txt.dateError : null"
        [value]="date() ?? v.deliveryDate"
        (valueChange)="changeDate($event)"
      />
      @if (dateNotice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      @if (dateChanged()) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="dateInvalid() || savingDate()"
          (click)="saveDate()"
        >
          {{ savingDate() ? txt.savingDate : txt.saveDate }}
        </button>
      }
      @if (v.deliver) {
        <button type="button" class="md-btn md-btn--primary" (click)="go('deliver')">
          {{ txt.deliver }}
        </button>
      }
      @if (v.invoice) {
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="!v.deliver"
          (click)="go('invoice')"
        >
          {{ txt.invoice }}
        </button>
      }
      <p class="muted">{{ txt.note }}</p>
      @for (line of v.services; track $index) {
        <app-item-card [title]="line.title" [meta]="line.meta" [detail]="line.detail" />
      }
      <button type="button" class="md-btn" (click)="router.navigate(['/sales'])">
        {{ txt.backToSales }}
      </button>
    } @else if (failed()) {
      <app-page-heading [title]="txt.pageTitle" [subtitle]="name()" />
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
export class SalesOrderContainer {
  readonly name = input.required<string>();

  private readonly api = inject(SalesOrderApiService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  private readonly order = signal<SalesOrderDetail | null>(null);
  protected readonly failed = signal(false);
  /** The expected delivery as typed, until saved. */
  protected readonly date = signal<string | null>(null);
  protected readonly savingDate = signal(false);
  private readonly dateResult = signal<'saved' | 'permission' | 'offline' | 'error' | null>(null);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sales.quote.back'),
      pageTitle: t('sales.order.pageTitle'),
      expected: t('sales.order.expected'),
      dateError: t('sales.order.dateError'),
      saveDate: t('sales.order.saveDate'),
      savingDate: t('sales.order.savingDate'),
      note: t('sales.order.note'),
      deliver: t('sales.order.deliverAction'),
      invoice: t('sales.order.invoiceAction'),
      backToSales: t('sales.quote.backToSales'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      loadFailed: {
        title: t('sales.order.loadFailed.title'),
        message: t('sales.order.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const order = this.order();
    if (!order) {
      return null;
    }
    const tr = this.i18n.tr();
    const caps = this.caps();
    const currency = this.business.active()?.currency ?? '';
    const cards = order.lines.map((l) => ({
      isStock: l.isStock,
      ...orderLineCard(l, currency, tr),
    }));
    return {
      ...orderHeading(order, tr),
      chips: orderChips(order, tr),
      // As on the mock: goods first, then the date and actions, then the services.
      goods: cards.filter((c) => c.isStock),
      services: cards.filter((c) => !c.isStock),
      deliveryDate: order.deliveryDate ?? '',
      editable: caps.sell && orderOpen(order) && order.deliveryStatus !== 'Fully Delivered',
      date: order.date,
      deliver: caps.deliverOrders && orderOpen(order) && order.lines.some((l) => toDeliver(l) > 0),
      invoice:
        caps.invoiceOrders &&
        orderOpen(order) &&
        !['Fully Billed', 'Closed'].includes(order.billingStatus),
    };
  });

  protected readonly dateChanged = computed(() => {
    const date = this.date();
    return date !== null && date !== (this.order()?.deliveryDate ?? '');
  });

  /** ERPNext refuses an expected delivery before the order's own date. */
  protected readonly dateInvalid = computed(() => {
    const date = this.date();
    const order = this.order();
    return date !== null && !!order && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < order.date);
  });

  protected readonly dateNotice = computed(() => {
    const result = this.dateResult();
    if (!result) {
      return null;
    }
    const { t } = this.i18n.tr();
    return {
      tone: result === 'saved' ? ('tint' as const) : ('danger' as const),
      title: t(`sales.order.date.${result}.title`),
      message: t(`sales.order.date.${result}.message`),
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
    this.date.set(null);
    this.dateResult.set(null);
    this.savingDate.set(false);
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

  protected go(task: 'deliver' | 'invoice'): void {
    void this.router.navigate(['/sales/orders', this.name(), task]);
  }

  protected changeDate(date: string): void {
    this.dateResult.set(null);
    this.date.set(date);
  }

  protected async saveDate(): Promise<void> {
    const order = this.order();
    const date = this.date();
    if (!order || date === null || this.dateInvalid() || this.savingDate()) {
      return;
    }
    const run = this.run;
    this.savingDate.set(true);
    this.dateResult.set(null);
    try {
      await this.api.setDeliveryDate(order.name, date);
      const updated = await this.api.order(order.name);
      if (run === this.run) {
        this.order.set(updated);
        this.date.set(null);
        this.dateResult.set('saved');
      }
    } catch (error) {
      if (run === this.run) {
        const kind = ErpnextError.from(error).kind;
        this.dateResult.set(
          kind === 'forbidden' ? 'permission' : kind === 'offline' ? 'offline' : 'error',
        );
      }
    } finally {
      if (run === this.run) {
        this.savingDate.set(false);
      }
    }
  }
}

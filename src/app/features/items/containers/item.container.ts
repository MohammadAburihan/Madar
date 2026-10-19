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
import { toIsoDate } from '../../../core/format/format';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ItemsApiService } from '../data-access/items-api.service';
import { ItemDetail } from '../data-access/items.models';
import { itemView } from './items-view';

/** One item or service: its prices, and for a product where its stock is. */
@Component({
  selector: 'app-item',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    .lines {
      margin: 0;
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/catalog'])" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @if (v.prices.length) {
        <app-totals-card density="compact" [rows]="v.prices" />
      }
      @if (detail()!.kind === 'service') {
        <app-feedback-card [title]="txt.service.title" [message]="txt.service.message" />
      } @else {
        <h2>{{ txt.stockHeading }}</h2>
        @for (s of v.stock; track s.message) {
          <app-feedback-card [title]="s.title" [message]="s.message" />
        }
        @if (v.stockUnread) {
          <p class="muted">{{ txt.stockUnread }}</p>
        } @else if (v.noStock) {
          <p class="muted">{{ txt.noStockYet }}</p>
        }
      }
      <p class="lines">{{ v.lines }}</p>
      @if (canEdit()) {
        <button type="button" class="md-btn md-btn--primary" (click)="edit()">
          {{ detail()!.kind === 'service' ? txt.editService : txt.editItem }}
        </button>
      }
    } @else if (failed(); as f) {
      <app-page-heading [title]="txt.title" [subtitle]="code()" />
      <app-feedback-card tone="danger" [title]="txt[f].title" [message]="txt[f].message" />
      @if (f === 'loadFailed') {
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      }
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class ItemContainer {
  readonly code = input.required<string>();

  private readonly api = inject(ItemsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly detail = signal<ItemDetail | null>(null);
  protected readonly failed = signal<'loadFailed' | 'missing' | null>(null);
  protected readonly canEdit = computed(() => this.session.capabilities().manageItems);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('items.title'),
      title: t('items.title'),
      stockHeading: t('items.stockHeading'),
      stockUnread: t('items.stockUnread'),
      noStockYet: t('items.noStockYet'),
      editItem: t('items.editItem'),
      editService: t('items.editService'),
      loading: t('items.loading'),
      retry: t('items.retry'),
      service: block('items.serviceCard'),
      loadFailed: block('items.loadFailed'),
      missing: block('items.missing'),
    };
  });

  protected readonly view = computed(() => {
    const detail = this.detail();
    return detail
      ? itemView(
          detail,
          this.business.active()?.currency ?? '',
          this.session.capabilities().seeCosts,
          this.i18n.tr(),
        )
      : null;
  });

  constructor() {
    effect(() => {
      this.code();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    this.detail.set(null);
    this.failed.set(null);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const today = toIsoDate(this.clock.now());
      const detail = await this.api.detail(this.code(), business.name, today);
      if (run === this.run) {
        this.detail.set(detail);
      }
    } catch (error) {
      if (run === this.run) {
        const e = ErpnextError.from(error);
        this.failed.set(
          e.status === 404 || e.excType === 'DoesNotExistError' ? 'missing' : 'loadFailed',
        );
      }
    }
  }

  protected edit(): void {
    void this.router.navigate(['/catalog', this.code(), 'edit']);
  }
}

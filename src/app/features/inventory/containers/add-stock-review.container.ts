import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectAddStockContext } from './add-stock-context';
import { addStockSummary } from './add-stock-view';

/** Step 2: what comes in, before it is posted. */
@Component({
  selector: 'app-add-stock-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
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
      <app-feedback-card [title]="v.card.title" [message]="v.card.message" />
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming' || !ctx.store.ready()"
        (click)="ctx.store.confirm(ctx.withCosts())"
      >
        {{ ctx.store.state() === 'confirming' ? v.confirming : v.confirm }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.go('')">{{ v.edit }}</button>
      <p class="muted">{{ v.reference }}</p>
    }
  `,
})
export class AddStockReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out post never happened. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectAddStockContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const warehouse = store.warehouse();
    if (!warehouse || !store.lines().length) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const parsed = store.parsed();
    const withCosts = this.ctx.withCosts();
    return {
      back: tr.t('sale.back'),
      title: tr.t('addStock.reviewTitle'),
      subtitle: `${this.ctx.warehouseName(warehouse)} · ${tr.t(`addStock.reasons.${store.reason()}`)}`,
      card: addStockSummary(
        {
          lines: store.lines().map((l, i) => ({
            item: l.item.code,
            name: l.item.name,
            uom: l.item.uom,
            qty: Number.isFinite(parsed[i].qty) ? parsed[i].qty : 0,
            rate: withCosts ? parsed[i].cost : null,
          })),
        },
        this.ctx.currency(),
        withCosts,
        tr,
      ),
      confirm: tr.t('addStock.confirm'),
      confirming: tr.t('adjust.confirming'),
      edit: tr.t('addStock.edit'),
      reference: tr.t('adjust.reference', { reference: store.reference() }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      const item = this.ctx.store.lines().find((l) => l.item.code === this.ctx.store.failedItem());
      return {
        tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
        title: t(`addStock.failed.${failure}.title`, { item: item?.item.name ?? '' }),
        message: t(`addStock.failed.${failure}.message`, { item: item?.item.name ?? '' }),
      };
    }
    if (this.notCreated()) {
      return {
        tone: 'warning' as const,
        title: t('adjust.notCreated.title'),
        message: t('adjust.notCreated.message'),
      };
    }
    return null;
  });

  constructor() {
    effect(() => {
      const state = this.ctx.store.state();
      untracked(() => {
        if (state === 'confirmed') {
          void this.ctx.go('done', { replaceUrl: true });
        } else if (state === 'unresolved') {
          void this.ctx.go('checking', { replaceUrl: true });
        }
      });
    });
  }

  ngOnInit(): void {
    const state = this.ctx.store.state();
    if (!this.ctx.store.ready() && state !== 'failed' && state !== 'confirming') {
      void this.ctx.go('', { replaceUrl: true });
    }
  }
}

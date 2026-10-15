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
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectSupplyContext } from './supply-context';
import { pendingCards, reviewRows } from './supply-view';

/** Step 2: the stock movement the delivery posts, before it is posted. */
@Component({
  selector: 'app-supply-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.go('')" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (view(); as v) {
      <app-status-chip [label]="txt.ready" />
      <app-totals-card density="compact" [heading]="v.heading" [rows]="v.rows" />
      <app-feedback-card tone="warning" [title]="txt.postsTitle" [message]="v.posts" />
      @for (card of v.pending; track card.title) {
        <app-feedback-card [title]="card.title" [message]="card.message" />
      }
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : v.confirm }}
      </button>
      <button
        type="button"
        class="md-btn"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="ctx.go('')"
      >
        {{ txt.edit }}
      </button>
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class SupplyReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out delivery was never posted. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectSupplyContext();
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('project.back'),
      title: t('project.supply.reviewTitle'),
      subtitle: t('project.supply.subtitle', {
        project: this.ctx.store.project() ?? '',
        name: this.ctx.store.plan()?.itemName ?? '',
      }),
      ready: t('project.supply.ready'),
      postsTitle: t('project.supply.postsTitle'),
      confirming: t('project.supply.confirming'),
      edit: t('project.supply.edit'),
      reference: t('purchase.review.reference', { reference: this.ctx.store.reference() }),
    };
  });

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const plan = store.plan();
    const source = store.source();
    if (!plan || !source) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const sending = store.qty();
    return {
      heading: `${plan.itemName} · ${plan.item}`,
      rows: reviewRows(plan, source, sending, store.shortfall(), tr),
      posts: tr.t('project.supply.postsMessage', { qty: sending, warehouse: source.name }),
      pending: pendingCards(plan, tr),
      confirm: tr.t('project.supply.confirm', { qty: sending }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`project.supply.failed.${failure}.title`),
        message: t(`project.supply.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('project.supply.notCreated.title'),
          message: t('project.supply.notCreated.message'),
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
    if (store.state() === 'unresolved' || store.state() === 'checking') {
      void this.ctx.go('checking', { replaceUrl: true });
    } else if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (store.state() !== 'confirming' && !store.ready()) {
      void this.ctx.go('', { replaceUrl: true });
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
    } else if (state === 'failed') {
      void this.ctx.go('', { replaceUrl: true });
    }
  }
}

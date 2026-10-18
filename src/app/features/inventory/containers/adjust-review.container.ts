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
import { injectAdjustContext } from './adjust-context';
import { reviewCard } from './adjust-view';

/** Step 2: what the count or write-off changes, before it is posted. */
@Component({
  selector: 'app-adjust-review',
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
      @if (v.card; as card) {
        <app-feedback-card [title]="card.title" [message]="card.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming' || !ctx.store.ready()"
        (click)="ctx.store.confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? v.confirming : v.confirm }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.go('')">{{ v.edit }}</button>
      <p class="muted">{{ v.reference }}</p>
    }
  `,
})
export class AdjustReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out adjustment was never posted. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectAdjustContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const item = store.item();
    const warehouse = this.ctx.warehouse();
    if (!item || !warehouse) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const k = this.ctx.key;
    return {
      back: t('sale.back'),
      title: t(k('reviewTitle')),
      subtitle: `${item.code} · ${warehouse.name}`,
      // Cleared after "stock changed": the count is entered again before anything is shown as posting.
      card: !store.qtyValid()
        ? null
        : reviewCard(
            this.ctx.kind,
            item,
            warehouse,
            store.qty(),
            store.change(),
            store.damageType(),
            store.reason().trim(),
            tr,
          ),
      confirm: t(k('confirm')),
      confirming: t('adjust.confirming'),
      edit: t(k('edit')),
      reference: t('adjust.reference', { reference: store.reference() }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      return {
        tone:
          failure === 'offline' || failure === 'moved' ? ('warning' as const) : ('danger' as const),
        title: t(`adjust.failed.${failure}.title`),
        message: t(`adjust.failed.${failure}.message`),
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

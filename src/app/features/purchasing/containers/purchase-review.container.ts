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
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectPurchaseContext } from './purchase-context';
import { beforeMessage, reviewCard } from './purchase-view';

/** Step 2: what the order contains and what confirming creates. */
@Component({
  selector: 'app-purchase-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
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
      @for (card of v.cards; track $index) {
        <app-item-card
          [title]="card.title"
          [meta]="card.meta"
          [detail]="card.detail"
          [kind]="card.kind"
        />
      }
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      <app-feedback-card [title]="v.beforeTitle" [message]="v.beforeMessage" />
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming' || ctx.store.savingDraft()"
        (click)="ctx.store.confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? v.confirming : v.confirm }}
      </button>
      <button
        type="button"
        class="md-btn"
        [disabled]="ctx.store.state() === 'confirming' || ctx.store.savingDraft()"
        (click)="saveDraft()"
      >
        {{ ctx.store.savingDraft() ? v.savingDraft : v.saveDraft }}
      </button>
      <p class="muted">{{ v.reference }}</p>
    }
  `,
})
export class PurchaseReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out order was never created. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectPurchaseContext();
  protected readonly savedDraft = signal<string | null>(null);

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const supplier = store.supplierInfo();
    if (!supplier || !store.lines().length) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const currency = this.ctx.currency();
    return {
      back: t('sale.back'),
      title: t('purchase.review.title'),
      subtitle: t('purchase.review.subtitle', {
        supplier: supplier.name,
        business: this.ctx.businessName(),
      }),
      cards: store.lines().map((l) => reviewCard(l, currency, tr)),
      beforeTitle: t('purchase.review.beforeTitle'),
      beforeMessage: beforeMessage(store.lines(), currency, tr),
      confirm: t('purchase.review.confirm'),
      confirming: t('purchase.review.confirming'),
      saveDraft: t('purchase.review.saveDraft'),
      savingDraft: t('purchase.review.savingDraft'),
      reference: t('purchase.review.reference', { reference: store.reference() }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      return {
        tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
        title: t(`purchase.failed.${failure}.title`),
        message: t(`purchase.failed.${failure}.message`),
      };
    }
    const saved = this.savedDraft();
    if (saved) {
      return {
        tone: 'tint' as const,
        title: t('purchase.review.draftSaved.title'),
        message: t('purchase.review.draftSaved.message', { order: saved }),
      };
    }
    if (this.notCreated()) {
      return {
        tone: 'warning' as const,
        title: t('purchase.notCreated.title'),
        message: t('purchase.notCreated.message'),
      };
    }
    return null;
  });

  constructor() {
    effect(() => {
      const state = this.ctx.store.state();
      untracked(() => {
        const result = this.ctx.store.result();
        if (state === 'confirmed' && result) {
          void this.ctx.openOrder(result, { replaceUrl: true });
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

  protected async saveDraft(): Promise<void> {
    this.savedDraft.set(await this.ctx.store.saveDraft());
  }
}

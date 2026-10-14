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
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectTransferContext } from './transfer-context';
import { reviewCard } from './transfer-view';

/** Step 2: both balances before and after, before the move is posted. */
@Component({
  selector: 'app-transfer-review',
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
    @if (view(); as v) {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="v.back" (back)="ctx.go('')" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-status-chip [label]="v.readyToPost" />
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      <app-totals-card density="compact" [heading]="v.card.heading" [rows]="v.card.rows" />
      <app-feedback-card [title]="v.before.title" [message]="v.before.message" />
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="ctx.store.state() === 'confirming'"
        (click)="ctx.store.confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? v.confirming : v.confirm }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.go('')">{{ v.edit }}</button>
      <p class="muted">{{ v.reference }}</p>
    }
  `,
})
export class TransferReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out transfer was never posted. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectTransferContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const item = store.item();
    const from = store.warehouses().find((w) => w.id === store.from());
    const to = store.warehouses().find((w) => w.id === store.to());
    if (!item || !from || !to) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const qty = store.qty();
    return {
      back: t('sale.back'),
      title: t('transfer.reviewTitle'),
      subtitle: `${item.name} · ${item.code}`,
      readyToPost: t('transfer.readyToPost'),
      card: reviewCard(item, from, to, qty, tr),
      before: { title: t('transfer.before.title'), message: t('transfer.before.message') },
      confirm: t('transfer.confirm'),
      confirming: t('transfer.confirming'),
      edit: t('transfer.edit'),
      reference: t('transfer.reference', { reference: store.reference() }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (this.ctx.store.state() === 'failed' && failure) {
      return {
        tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
        title: t(`transfer.failed.${failure}.title`),
        message: t(`transfer.failed.${failure}.message`),
      };
    }
    if (this.notCreated()) {
      return {
        tone: 'warning' as const,
        title: t('transfer.notCreated.title'),
        message: t('transfer.notCreated.message'),
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

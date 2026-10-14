import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  signal,
  untracked,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { qtyText } from './inventory-view';
import { injectTransferContext } from './transfer-context';

/** Shown when a confirmation timed out: the move may have posted, so the user checks instead of resubmitting. */
@Component({
  selector: 'app-transfer-checking',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/inventory'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    <app-feedback-card tone="warning" [title]="txt.cardTitle" [message]="txt.cardMessage" />
    <app-totals-card density="compact" [rows]="txt.rows" />
    <p class="muted">{{ txt.reference }}</p>
    @if (pending() || ctx.store.state() === 'confirming') {
      <p class="muted" role="status">{{ txt.pending }}</p>
    }
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="ctx.store.state() !== 'unresolved'"
      (click)="check()"
    >
      {{ ctx.store.state() === 'checking' ? txt.checkingNow : txt.check }}
    </button>
    <button type="button" class="md-btn" (click)="ctx.router.navigate(['/'])">
      {{ txt.home }}
    </button>
  `,
})
export class TransferCheckingContainer implements OnInit {
  protected readonly ctx = injectTransferContext();
  protected readonly pending = signal(false);

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const store = this.ctx.store;
    const sent = store.sent();
    const item = store.item();
    return {
      back: t('sale.back'),
      title: t('transfer.checkingTitle'),
      subtitle: item ? `${item.name} · ${item.code}` : '',
      cardTitle: t('transfer.checkingCard.title'),
      cardMessage: t('transfer.checkingCard.message'),
      rows:
        sent && item
          ? [
              {
                label: t('transfer.plannedMove'),
                value: t('transfer.heading', {
                  qty: qtyText(sent.qty, item.uom, tr),
                  from: this.ctx.warehouseName(sent.from),
                  to: this.ctx.warehouseName(sent.to),
                }),
              },
            ]
          : [],
      reference: t('sale.checking.reference', { reference: store.reference() }),
      pending: t('sale.checking.pending'),
      check: t('sale.checking.check'),
      checkingNow: t('sale.checking.checkingNow'),
      home: t('sale.checking.home'),
    };
  });

  constructor() {
    // Reached while a slow confirmation still runs: move on as soon as it settles.
    effect(() => {
      const state = this.ctx.store.state();
      if (state === 'confirmed' || state === 'failed') {
        untracked(() => this.ngOnInit());
      }
    });
  }

  ngOnInit(): void {
    if (!this.ctx.store.busy()) {
      void this.ctx.go(this.ctx.store.result() ? 'done' : '', { replaceUrl: true });
    }
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.ctx.store.checkResult();
    if (outcome === 'found') {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (outcome === 'not-found') {
      void this.ctx.go('review', { replaceUrl: true, queryParams: { notCreated: 1 } });
    } else {
      this.pending.set(true);
    }
  }
}

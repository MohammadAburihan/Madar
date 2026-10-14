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
import { injectReceiptContext } from './receipt-context';

/** Shown when a confirmation timed out: the receipt may exist, so the user checks instead of resubmitting. */
@Component({
  selector: 'app-receipt-checking',
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
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/purchases'])" />
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
export class ReceiptCheckingContainer implements OnInit {
  protected readonly ctx = injectReceiptContext();
  protected readonly pending = signal(false);

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const store = this.ctx.store;
    const sent = store.sent();
    const units = Math.round((sent?.lines.reduce((sum, l) => sum + l.qty, 0) ?? 0) * 1e6) / 1e6;
    return {
      back: t('sale.back'),
      title: t('purchase.receive.checking.title'),
      subtitle: store.orderName() ?? '',
      cardTitle: t('purchase.receive.checking.cardTitle'),
      cardMessage: t('purchase.receive.checking.cardMessage'),
      rows: sent
        ? [
            {
              label: t('purchase.receive.checking.planned'),
              value: t('purchase.receive.checking.plannedValue', {
                units: tr.plural('purchase.receive.units', units, { count: units }),
                warehouse: this.ctx.warehouseName(sent.warehouse),
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
    const store = this.ctx.store;
    if (!store.busy()) {
      void this.ctx.go(store.result() ? 'done' : '', { replaceUrl: true });
    }
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.ctx.store.checkResult();
    if (outcome === 'found') {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (outcome === 'not-found') {
      void this.ctx.go('', { replaceUrl: true, queryParams: { notCreated: 1 } });
    } else {
      this.pending.set(true);
    }
  }
}

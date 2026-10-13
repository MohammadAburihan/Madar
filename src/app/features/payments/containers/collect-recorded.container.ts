import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectCollectionContext } from './collection-context';
import { recordedView } from './collection-view';

@Component({
  selector: 'app-collect-recorded',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TextFieldComponent,
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
      <app-back-link [label]="v.back" (back)="ctx.router.navigate(['/'])" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-status-chip [label]="v.recorded" />
      <app-feedback-card [title]="v.card.title" [message]="v.card.message" />
      <app-totals-card [rows]="v.totals" />
      <app-text-field [label]="v.accountLabel" [value]="v.account" [readonly]="true" />
      @if (v.invoice) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          (click)="openInvoice(v.invoice, v.payment)"
        >
          {{ v.viewInvoice }}
        </button>
      } @else {
        <button
          type="button"
          class="md-btn md-btn--primary"
          (click)="ctx.router.navigate(['/money'])"
        >
          {{ v.viewHistory }}
        </button>
      }
      <button type="button" class="md-btn" (click)="another()">{{ v.another }}</button>
    }
  `,
})
export class CollectRecordedContainer implements OnInit {
  protected readonly ctx = injectCollectionContext();

  protected readonly view = computed(() => {
    const result = this.ctx.store.result();
    if (!result) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const single = result.invoices.length === 1 ? result.invoices[0].invoice : null;
    return {
      back: t('sale.back'),
      title: t('collect.recordedTitle'),
      subtitle: `${result.payment} · ${this.ctx.store.customer()?.name ?? ''}`,
      recorded: t('collect.recorded'),
      ...recordedView(result, this.ctx.currency(), tr),
      accountLabel: t('money.headers.account'),
      account: this.ctx.store.account()?.label ?? '',
      payment: result.payment,
      invoice: single,
      viewInvoice: single ? t('collect.viewInvoice', { invoice: single }) : '',
      viewHistory: t('collect.viewHistory'),
      another: t('collect.another'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true, state: { edit: true } });
    }
  }

  protected openInvoice(invoice: string, payment: string): void {
    void this.ctx.router.navigate(['/sales/invoices', invoice], {
      queryParams: { after: payment },
    });
  }

  protected another(): void {
    this.ctx.store.start();
    void this.ctx.go('');
  }
}

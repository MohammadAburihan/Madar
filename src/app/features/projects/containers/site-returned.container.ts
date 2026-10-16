import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectSiteContext } from './site-context';
import { returnedView } from './site-view';

/** The posted return: the project's balances after it, and what is still on order. */
@Component({
  selector: 'app-site-returned',
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
    <app-back-link [label]="txt.back" (back)="ctx.openProject()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (view(); as v) {
      <app-status-chip [label]="v.chip" />
      <app-feedback-card [title]="v.card.title" [message]="v.card.message" />
      <app-totals-card density="compact" [rows]="v.rows" />
      @if (v.pending; as p) {
        <app-feedback-card tone="warning" [title]="p.title" [message]="p.message" />
        @if (ctx.session.capabilities().seeCosts) {
          <button type="button" class="md-btn md-btn--primary" (click)="openOrder(p.order)">
            {{ txt.openOrder(p.order) }}
          </button>
        }
      }
      <button
        type="button"
        class="md-btn"
        [class.md-btn--primary]="!v.pending || !ctx.session.capabilities().seeCosts"
        (click)="ctx.openProject()"
      >
        {{ txt.backToProject }}
      </button>
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class SiteReturnedContainer implements OnInit {
  protected readonly ctx = injectSiteContext();
  protected readonly loadFailed = signal(false);

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const store = this.ctx.store;
    return {
      back: tr.t('project.back'),
      title: tr.t('project.site.returnedTitle'),
      subtitle: tr.t('project.site.subtitle', {
        title: store.balance()?.itemName ?? store.item() ?? '',
        project: store.project() ?? '',
      }),
      backToProject: tr.t('project.site.backToProject'),
      openOrder: (order: string) => tr.t('project.site.openOrder', { order }),
      loading: tr.t('project.loading'),
      retry: tr.t('project.retry'),
      loadFailed: {
        title: tr.t('project.site.loadFailed.title'),
        message: tr.t('project.site.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const balance = store.balance();
    const sent = store.sent();
    if (!balance || !sent?.to) {
      return null;
    }
    const target = balance.warehouses.find((w) => w.warehouse === sent.to) ?? {
      name: sent.to,
      qty: 0,
    };
    return returnedView(balance, target, sent.qty, this.ctx.i18n.tr());
  });

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.action() !== 'return' || !store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    store.resultShown.set(true);
    if (!store.balance()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.ctx.store.load();
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected openOrder(order: string): void {
    void this.ctx.router.navigate(['/purchases/order', order]);
  }
}

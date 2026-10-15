import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectSupplyContext } from './supply-context';
import { planRows, supplyAdvice, supplyUnits } from './supply-view';

/** Step 1 of "Supply a project": what the item needs, what to send now, and what to buy. */
@Component({
  selector: 'app-supply-plan',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    StatusChipComponent,
    TextFieldComponent,
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
    @if (!ctx.session.capabilities().supplyProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (ctx.store.siteMissing()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.siteMissing.title"
        [message]="txt.siteMissing.message"
      />
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (view(); as v) {
      <app-status-chip [label]="txt.plan" />
      <app-item-card [title]="v.itemName" [meta]="v.item" [detail]="txt.requirement" />
      <app-totals-card density="compact" [rows]="v.rows" />
      @if (!v.need) {
        <app-feedback-card
          [title]="txt.nothingNeeded.title"
          [message]="txt.nothingNeeded.message"
        />
      } @else if (!v.sources.length) {
        <app-feedback-card
          tone="warning"
          [title]="txt.noStock.title"
          [message]="txt.noStock.message"
        />
      } @else {
        <app-select-field
          [label]="txt.from"
          [options]="v.sources"
          [value]="ctx.store.from()"
          (valueChange)="ctx.store.setFrom($event)"
        />
        <app-text-field
          [label]="txt.qty"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="v.uom"
          [error]="v.qtyError"
          [value]="ctx.store.qtyInput()"
          (valueChange)="ctx.store.setQty($event)"
        />
        @if (v.advice; as a) {
          <app-feedback-card [tone]="a.tone" [title]="a.title" [message]="a.message" />
        }
      }
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        @if (ctx.store.failure() === 'changed' || ctx.store.failure() === 'stock') {
          <button type="button" class="md-btn" (click)="reload()">{{ txt.reload }}</button>
        }
      }
      <p class="muted">{{ txt.note }}</p>
      @if (v.need && v.sources.length) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="!ctx.store.ready()"
          (click)="ctx.go('review')"
        >
          {{ v.toReview }}
        </button>
      }
      @if (v.shortfall > 0) {
        <button type="button" class="md-btn" (click)="buy(v.shortfall)">{{ v.buy }}</button>
      }
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class SupplyPlanContainer implements OnInit {
  protected readonly ctx = injectSupplyContext();
  protected readonly loadFailed = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('project.back'),
      title: t('project.supply.title'),
      subtitle: t('project.supply.subtitle', {
        project: this.ctx.store.project() ?? '',
        name: this.ctx.store.plan()?.itemName ?? this.ctx.store.item() ?? '',
      }),
      plan: t('project.supply.plan'),
      requirement: t('project.supply.requirementInternal'),
      from: t('project.supply.from'),
      qty: t('project.supply.qty'),
      note: t('project.supply.note'),
      reload: t('project.supply.reload'),
      loading: t('project.loading'),
      retry: t('project.retry'),
      noAccess: block('project.supply.noAccess'),
      siteMissing: block('project.supply.siteMissing'),
      loadFailed: block('project.supply.loadFailed'),
      nothingNeeded: block('project.supply.nothingNeeded'),
      noStock: block('project.supply.noStock'),
    };
  });

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const plan = store.plan();
    if (!plan) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const source = store.source();
    const shortfall = store.shortfall();
    const sending = store.qtyValid() ? store.qty() : 0;
    return {
      item: plan.item,
      itemName: plan.itemName,
      uom: plan.uom,
      need: plan.need,
      sources: plan.sources.map((s) => ({ value: s.warehouse, label: `${s.name} · ${s.qty}` })),
      rows: planRows(plan, source, shortfall, tr),
      qtyError:
        store.qtyInput().trim() && !store.qtyValid()
          ? tr.t('project.supply.qtyError', { max: source?.qty ?? 0 })
          : null,
      advice: sending > 0 ? supplyAdvice(sending, shortfall, tr) : null,
      shortfall,
      toReview: tr.t('project.supply.toReview', { qty: sending }),
      buy: tr.t('project.supply.buy', { units: supplyUnits(shortfall, tr) }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    return failure && this.ctx.store.state() === 'failed'
      ? {
          title: t(`project.supply.failed.${failure}.title`),
          message: t(`project.supply.failed.${failure}.message`),
        }
      : null;
  });

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go(store.state() === 'confirming' ? 'review' : 'checking', {
        replaceUrl: true,
      });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('done', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed') {
      // The delivery was posted and shown (here by Back): this visit is a new delivery.
      store.start(store.project() ?? '', store.item() ?? '');
    }
    if (!store.plan() && !store.siteMissing()) {
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

  /** After stock or an earlier delivery changed the picture: start a clean task from the current plan. */
  protected reload(): void {
    this.ctx.store.start(this.ctx.store.project() ?? '', this.ctx.store.item() ?? '');
    void this.load();
  }

  /** The shortfall goes through the purchase order task, booked to this project. */
  protected buy(qty: number): void {
    void this.ctx.router.navigate(['/purchases/new'], {
      queryParams: { project: this.ctx.store.project(), item: this.ctx.store.item(), qty },
    });
  }
}

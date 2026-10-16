import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectSiteContext } from './site-context';
import { siteChip, siteRows, useAdvice, useRows } from './site-view';
import { supplyUnits } from './supply-view';

/** Step 1 of "Materials at site": the project's balance of one item, and recording what it used. */
@Component({
  selector: 'app-site-materials',
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
      <app-feedback-card [title]="txt.siteMissing.title" [message]="txt.siteMissing.message" />
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (view(); as v) {
      <app-status-chip [label]="v.chip" />
      <app-totals-card density="compact" [rows]="v.rows" />
      @if (!v.atSite) {
        <app-feedback-card
          [title]="txt.nothingAtSite.title"
          [message]="txt.nothingAtSite.message"
        />
      } @else {
        <app-text-field
          [label]="txt.qty"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="v.uom"
          [error]="v.qtyError"
          [value]="ctx.store.useInput()"
          (valueChange)="ctx.store.setUse($event)"
        />
        @if (v.preview; as p) {
          <app-totals-card density="compact" tone="tint" [heading]="p.heading" [rows]="p.rows" />
          <app-feedback-card [title]="p.advice.title" [message]="p.advice.message" />
        }
      }
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        @if (ctx.store.stale()) {
          <button type="button" class="md-btn" (click)="reload()">{{ txt.reload }}</button>
        }
      }
      @if (v.atSite) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="!ctx.store.canUse()"
          (click)="confirm()"
        >
          {{ ctx.store.state() === 'confirming' ? txt.confirming : v.confirm }}
        </button>
        <button type="button" class="md-btn" [disabled]="ctx.store.busy()" (click)="toReturn()">
          {{ txt.toReturn }}
        </button>
      }
      <p class="muted">{{ txt.note }}</p>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class SiteMaterialsContainer implements OnInit {
  protected readonly ctx = injectSiteContext();
  private readonly route = inject(ActivatedRoute);
  protected readonly loadFailed = signal(false);
  /** Back here after a check found nothing posted. */
  private readonly notCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const store = this.ctx.store;
    return {
      back: t('project.back'),
      title: t('project.site.title'),
      subtitle: t('project.site.subtitle', {
        title: store.balance()?.itemName ?? store.item() ?? '',
        project: store.project() ?? '',
      }),
      qty: t('project.site.useQty'),
      toReturn: t('project.site.toReturn'),
      note: t('project.site.note'),
      reload: t('project.site.reload'),
      confirming: t('project.site.confirming'),
      loading: t('project.loading'),
      retry: t('project.retry'),
      noAccess: block('project.site.noAccess'),
      siteMissing: block('project.site.siteMissing'),
      loadFailed: block('project.site.loadFailed'),
      nothingAtSite: block('project.site.nothingAtSite'),
    };
  });

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const balance = store.balance();
    if (!balance) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const using = store.useValid() ? store.useQty() : 0;
    return {
      chip: siteChip(balance, tr),
      rows: siteRows(balance, tr),
      atSite: balance.atSite,
      uom: balance.uom,
      qtyError:
        store.useInput().trim() && !store.useValid()
          ? tr.t('project.site.useError', { max: balance.atSite })
          : null,
      preview:
        using > 0
          ? {
              heading: tr.t('project.site.useCard', { units: supplyUnits(using, tr) }),
              rows: useRows(balance, using, tr),
              advice: useAdvice(balance, using, tr),
            }
          : null,
      confirm: tr.t('project.site.confirmUse', { qty: using }),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const store = this.ctx.store;
    const failure = store.failure();
    if (failure && store.state() === 'failed' && store.action() === 'use') {
      return {
        title: t(`project.site.failed.${failure}.title`),
        message: t(`project.site.failed.${failure}.message`),
      };
    }
    return this.notCreated() && store.state() === 'idle'
      ? { title: t('project.site.notCreated.title'), message: t('project.site.notCreated.message') }
      : null;
  });

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go(this.ctx.resultStep(), { replaceUrl: true });
      return;
    }
    // A shown result, or a return under way: this visit records a new use.
    store.toUse();
    this.notCreated.set(this.route.snapshot.queryParamMap.has('notCreated'));
    if (!store.balance() && !store.siteMissing()) {
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

  protected reload(): void {
    this.loadFailed.set(false);
    void this.ctx.store.reload().catch(() => this.loadFailed.set(true));
  }

  protected async confirm(): Promise<void> {
    this.notCreated.set(false);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('return');
    } else if (state === 'unresolved') {
      void this.ctx.go('checking');
    }
  }

  protected toReturn(): void {
    this.ctx.store.toReturn();
    void this.ctx.go('return');
  }
}

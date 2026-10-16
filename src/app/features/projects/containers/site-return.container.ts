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
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { injectSiteContext } from './site-context';
import { balanceRows, pendingNotes, returnAdvice, returnRows, usedChip } from './site-view';

/** Step 2 of "Materials at site": the balance after a recorded use, and returning unused stock to a warehouse. */
@Component({
  selector: 'app-site-return',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
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
    <app-back-link [label]="txt.back" (back)="back()" />
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
      @if (v.atSite) {
        <app-select-field
          [label]="txt.returnTo"
          [options]="v.warehouses"
          [value]="ctx.store.returnTo()"
          (valueChange)="ctx.store.setReturnTo($event)"
        />
        <app-text-field
          [label]="txt.qty"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="v.uom"
          [error]="v.qtyError"
          [value]="ctx.store.returnInput()"
          (valueChange)="ctx.store.setReturn($event)"
        />
        @if (v.preview; as p) {
          <app-totals-card density="compact" tone="tint" [heading]="p.heading" [rows]="p.rows" />
          <app-feedback-card tone="warning" [title]="p.advice.title" [message]="p.advice.message" />
        }
      } @else {
        <app-feedback-card
          [title]="txt.nothingAtSite.title"
          [message]="txt.nothingAtSite.message"
        />
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
          [disabled]="!ctx.store.canReturn()"
          (click)="confirm()"
        >
          {{ ctx.store.state() === 'confirming' ? txt.confirming : v.confirm }}
        </button>
      }
      <button
        type="button"
        class="md-btn"
        [disabled]="ctx.store.busy()"
        (click)="ctx.openProject()"
      >
        {{ txt.done }}
      </button>
      @for (note of v.notes; track $index) {
        <p class="muted">{{ note }}</p>
      }
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class SiteReturnContainer implements OnInit {
  protected readonly ctx = injectSiteContext();
  private readonly route = inject(ActivatedRoute);
  protected readonly loadFailed = signal(false);
  private readonly notCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const store = this.ctx.store;
    return {
      back: t('project.back'),
      title: t(store.used() !== null ? 'project.site.usedTitle' : 'project.site.returnTitle'),
      subtitle: t('project.site.subtitle', {
        title: store.balance()?.itemName ?? store.item() ?? '',
        project: store.project() ?? '',
      }),
      returnTo: t('project.site.returnTo'),
      qty: t('project.site.returnQty'),
      done: t('project.site.done'),
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
    const target = store.target();
    const returning = store.returnValid() ? store.returnQty() : 0;
    return {
      chip: usedChip(balance, tr),
      rows: balanceRows(balance, tr),
      atSite: balance.atSite,
      uom: balance.uom,
      warehouses: balance.warehouses.map((w) => ({ value: w.warehouse, label: w.name })),
      qtyError:
        store.returnInput().trim() && !store.returnValid()
          ? tr.t('project.site.returnError', { max: balance.atSite })
          : null,
      preview:
        target && returning > 0
          ? {
              heading: tr.t('project.site.returnCard', { warehouse: target.name }),
              rows: returnRows(balance, target, returning, tr),
              advice: returnAdvice(balance, target, returning, tr),
            }
          : null,
      confirm: tr.t('project.site.confirmReturn', { qty: returning }),
      notes: pendingNotes(balance, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const store = this.ctx.store;
    const failure = store.failure();
    if (failure && store.state() === 'failed' && store.action() === 'return') {
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
    if (store.action() === 'return' && store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('returned', { replaceUrl: true });
      return;
    }
    if (store.action() === 'use' && store.state() === 'confirmed') {
      // This is where a recorded use is shown.
      store.resultShown.set(true);
    }
    store.toReturn();
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

  protected back(): void {
    void (this.ctx.store.used() !== null ? this.ctx.openProject() : this.ctx.go(''));
  }

  protected async confirm(): Promise<void> {
    this.notCreated.set(false);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('returned', { replaceUrl: true });
    } else if (state === 'unresolved') {
      void this.ctx.go('checking');
    }
  }
}

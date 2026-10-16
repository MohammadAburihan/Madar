import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectSupplyContext } from './supply-context';
import { supplyUnits } from './supply-view';

/** The posted delivery: what reached the site, and that nothing is marked used. */
@Component({
  selector: 'app-supply-done',
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
      <app-back-link [label]="v.back" (back)="ctx.openProject()" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-feedback-card [title]="v.card" [message]="v.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openProject()">
        {{ v.open }}
      </button>
      <button type="button" class="md-btn" (click)="another()">{{ v.another }}</button>
    }
  `,
})
export class SupplyDoneContainer implements OnInit {
  protected readonly ctx = injectSupplyContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const sent = store.sent();
    const plan = store.plan();
    const entry = store.result();
    if (!sent || !plan || !entry) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    return {
      back: tr.t('project.back'),
      title: tr.t('project.supply.doneTitle'),
      subtitle: tr.t('project.supply.doneSubtitle', { project: sent.project, entry }),
      card: tr.t('project.supply.doneCard', { units: supplyUnits(sent.qty, tr) }),
      message: tr.t('project.supply.doneMessage', {
        warehouse: store.source()?.name ?? sent.from,
        site: supplyUnits(plan.atSite + sent.qty, tr),
      }),
      open: tr.t('project.supply.openProject'),
      another: tr.t('project.supply.another'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }

  protected another(): void {
    this.ctx.store.start(this.ctx.store.project() ?? '', this.ctx.store.item() ?? '');
    void this.ctx.go('');
  }
}

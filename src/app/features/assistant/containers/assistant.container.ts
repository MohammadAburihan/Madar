import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { AssistantComposerComponent } from '../components/assistant-composer.component';
import { AssistantConversationComponent } from '../components/assistant-conversation.component';
import { AssistantSuggestionsComponent } from '../components/assistant-suggestions.component';
import { AssistantStore } from '../data-access/assistant.store';
import { buildAssistantView, recordRoute } from './assistant-view';

/** Ask the assistant about customers, items, sales and stock: it looks things up and never changes anything. */
@Component({
  selector: 'app-assistant',
  imports: [
    AssistantComposerComponent,
    AssistantConversationComponent,
    AssistantSuggestionsComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    :host {
      box-sizing: border-box;
      min-block-size: 100%;
    }

    .composer {
      position: sticky;
      inset-block-end: 0;
      margin-block-start: auto;
      padding-block: 12px;
      background: var(--md-bg);
    }
  `,
  template: `
    @let v = view();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="v.title" [subtitle]="v.subtitle">
        @if (v.started) {
          <button type="button" class="md-btn" (click)="store.clear()">{{ v.newChat }}</button>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      @if (v.started) {
        <button type="button" class="md-btn" (click)="store.clear()">{{ v.newChat }}</button>
      }
    }
    @if (v.started) {
      <app-assistant-conversation
        [label]="v.conversation"
        [items]="v.items"
        [activity]="v.activity"
        [problem]="v.problem"
        [busy]="v.busy"
        (opened)="open($event)"
      />
    } @else {
      <app-assistant-suggestions
        [label]="v.suggestionsLabel"
        [suggestions]="v.suggestions"
        (picked)="send($event)"
      />
    }
    <app-assistant-composer
      #composer
      class="composer"
      [(value)]="draft"
      [label]="v.composerLabel"
      [placeholder]="v.placeholder"
      [note]="v.note"
      [sendLabel]="v.send"
      [stopLabel]="v.stop"
      [busy]="v.busy"
      (send)="send($event)"
      (stop)="store.stop()"
    />
  `,
})
export class AssistantContainer implements OnDestroy {
  protected readonly store = inject(AssistantStore);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly draft = signal('');
  private readonly composer = viewChild('composer', { read: ElementRef });

  protected readonly view = computed(() =>
    buildAssistantView(
      {
        messages: this.store.messages(),
        links: this.store.links(),
        streaming: this.store.streaming(),
        state: this.store.state(),
        activeTools: this.store.activeTools(),
        problem: this.store.problem(),
      },
      this.i18n.tr(),
    ),
  );

  private visitedUser: string | null = null;

  constructor() {
    let user: string | null | undefined;
    let company: string | null = null;
    effect(() => {
      const nextUser = this.session.user()?.id ?? null;
      const nextCompany = this.business.active()?.name ?? null;
      const userChanged = user !== undefined && user !== nextUser;
      const companyChanged = company !== null && nextCompany !== null && company !== nextCompany;
      user = nextUser;
      company = nextCompany ?? company;
      if (userChanged || companyChanged) {
        untracked(() => this.draft.set(''));
      }
    });
    this.visitedUser = this.session.user()?.id ?? null;
    // The newest line sits above the pinned composer, so the composer is what is brought into view.
    effect(() => {
      const view = this.view();
      if (view.items.length || view.activity.length) {
        queueMicrotask(() => this.composer()?.nativeElement.scrollIntoView?.({ block: 'end' }));
      }
    });
  }

  ionViewWillEnter(): void {
    const current = this.session.user()?.id ?? null;
    if (current !== this.visitedUser) {
      this.draft.set('');
    }
    this.visitedUser = current;
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected send(text: string): void {
    this.draft.set('');
    void this.store.send(text);
  }

  protected open(key: string): void {
    const route = recordRoute(key);
    if (route) {
      void this.router.navigate(route);
    }
  }
}

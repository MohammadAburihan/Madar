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
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { SPEECH_OUTPUT } from '../../../core/speech/speech.tokens';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { AssistantComposerComponent } from '../components/assistant-composer.component';
import { AssistantConversationComponent } from '../components/assistant-conversation.component';
import { AssistantSuggestionsComponent } from '../components/assistant-suggestions.component';
import { AssistantStore } from '../data-access/assistant.store';
import { buildAssistantView, proposalTarget, recordRoute } from './assistant-view';

/** Ask the assistant about customers, items, sales and stock; it looks things up and proposes tasks the user confirms. */
@Component({
  selector: 'app-assistant',
  imports: [
    AssistantComposerComponent,
    FeedbackCardComponent,
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
        [voices]="voices()"
        [speakingId]="speakingId()"
        (readAloud)="readAloud($event)"
        (opened)="open($event)"
        (proposalOpened)="openProposal($event)"
        (choicePicked)="send($event)"
      />
    } @else {
      <app-assistant-suggestions
        [label]="v.suggestionsLabel"
        [suggestions]="v.suggestions"
        (picked)="send($event)"
      />
    }
    @if (v.voiceProblem; as message) {
      <app-feedback-card tone="warning" [title]="message" />
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
      [micAvailable]="store.voiceSupported()"
      [listening]="store.listening()"
      [readonly]="store.listening()"
      [speakLabel]="v.speak"
      [stopListeningLabel]="v.stopListening"
      [listeningLine]="v.listeningLine"
      (send)="send($event)"
      (stop)="store.stop()"
      (microphone)="toggleListening()"
    />
  `,
})
export class AssistantContainer implements OnDestroy {
  protected readonly store = inject(AssistantStore);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly prefills = inject(TaskPrefillService);
  private readonly speechOutput = inject(SPEECH_OUTPUT);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly draft = signal('');
  protected readonly voices = this.speechOutput.languages;
  protected readonly speakingId = signal<string | null>(null);
  private readonly composer = viewChild('composer', { read: ElementRef });

  protected readonly view = computed(() =>
    buildAssistantView(
      {
        messages: this.store.messages(),
        links: this.store.links(),
        proposals: this.store.proposals(),
        choices: this.store.choices(),
        currency: this.business.active()?.currency ?? '',
        streaming: this.store.streaming(),
        state: this.store.state(),
        activeTools: this.store.activeTools(),
        problem: this.store.problem(),
        voiceProblem: this.store.voiceProblem(),
        language: this.i18n.language(),
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
    effect(() => {
      if (!this.store.messages().length) {
        untracked(() => this.stopReading());
      }
    });
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

  ionViewWillLeave(): void {
    this.store.cancelListening();
    this.stopReading();
  }

  ngOnDestroy(): void {
    this.store.stop();
    this.store.cancelListening();
    this.stopReading();
  }

  protected toggleListening(): void {
    if (this.store.listening()) {
      this.store.stopListening();
      return;
    }
    this.stopReading();
    const typed = this.draft().trim();
    void this.store.listen((text) => this.draft.set(typed ? `${typed} ${text}` : text));
  }

  protected readAloud(id: string): void {
    if (this.speakingId() === id) {
      this.stopReading();
      return;
    }
    const speech = this.view().items.find((item) => item.id === id)?.speech;
    if (speech) {
      this.store.cancelListening();
      this.speakingId.set(id);
      this.speechOutput.speak(speech.text, speech.lang, () => {
        if (this.speakingId() === id) {
          this.speakingId.set(null);
        }
      });
    }
  }

  private stopReading(): void {
    this.speakingId.set(null);
    this.speechOutput.stop();
  }

  protected send(text: string): void {
    this.draft.set('');
    void this.store.send(text);
  }

  protected openProposal(id: string): void {
    const proposal = this.store.proposal(id);
    if (!proposal) {
      return;
    }
    const prefill = proposal.request ? this.prefills.put(proposal.request) : null;
    const target = proposalTarget(proposal, prefill);
    if (target) {
      void this.router.navigate(target.commands, { queryParams: target.queryParams });
    }
  }

  protected open(key: string): void {
    const route = recordRoute(key);
    if (route) {
      void this.router.navigate(route);
    }
  }
}

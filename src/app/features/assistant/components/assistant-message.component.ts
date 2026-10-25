import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideVolume2 } from '@lucide/angular';
import { SpeechLanguage } from '../../../core/speech/speech.models';
import { ConversationItemView } from '../containers/assistant-view';
import { AssistantChoicesComponent } from './assistant-choices.component';
import { AssistantProposalComponent } from './assistant-proposal.component';

/** One bubble: the user's question at the end side, the assistant's reply at the start side. */
@Component({
  selector: 'app-assistant-message',
  imports: [
    AssistantChoicesComponent,
    AssistantProposalComponent,
    LucideDynamicIcon,
    NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'item().role' },
  template: `
    <article [attr.aria-label]="item().author">
      <div class="bubble">
        @for (block of item().blocks; track $index) {
          @if (block.kind === 'list') {
            <ul dir="auto">
              @for (entry of block.items; track $index) {
                <li>
                  <ng-container *ngTemplateOutlet="runs; context: { $implicit: entry }" />
                </li>
              }
            </ul>
          } @else {
            <p dir="auto">
              <ng-container *ngTemplateOutlet="runs; context: { $implicit: block.segments }" />
            </p>
          }
        }
      </div>
      @if (speech(); as speech) {
        <button
          type="button"
          class="md-btn read"
          [attr.aria-pressed]="speaking()"
          (click)="readAloud.emit()"
        >
          <svg [lucideIcon]="readIcon" [size]="16" aria-hidden="true"></svg>
          <span>{{ speech.label }}</span>
        </button>
      }
      @if (item().links.length) {
        <div class="links">
          @for (link of item().links; track link.key) {
            <button type="button" class="md-btn" (click)="opened.emit(link.key)">
              {{ link.label }}
            </button>
          }
        </div>
      }
      @for (card of item().proposals; track card.id) {
        <app-assistant-proposal [card]="card" (opened)="proposalOpened.emit($event)" />
      }
      @if (item().choices.length) {
        <app-assistant-choices
          [label]="item().choicesLabel"
          [options]="item().choices"
          (picked)="choicePicked.emit($event)"
        />
      }
    </article>
    <ng-template #runs let-segments>
      @for (segment of segments; track $index) {
        @if (segment.bold) {
          <strong>{{ segment.text }}</strong>
        } @else {
          {{ segment.text }}
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    :host(.user) {
      align-items: flex-end;
    }

    :host(.assistant) {
      align-items: flex-start;
    }

    article {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-inline-size: 85%;
    }

    :host(.user) article {
      align-items: flex-end;
    }

    .bubble {
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
      padding: 12px 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      overflow-wrap: anywhere;
    }

    :host(.user) .bubble {
      border-color: var(--md-tint);
      background: var(--md-tint);
    }

    p {
      white-space: pre-line;
    }

    ul {
      margin: 0;
      padding-inline-start: 20px;
    }

    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .read,
    .links .md-btn {
      inline-size: auto;
      min-block-size: 40px;
      padding-block: 7px;
      font-size: 14px;
    }

    .read {
      inline-size: auto;
      align-self: flex-start;
      gap: 8px;
    }
  `,
})
export class AssistantMessageComponent {
  protected readonly readIcon = LucideVolume2;

  readonly item = input.required<ConversationItemView>();
  /** The languages the device can read aloud; a reply in another has no button. */
  readonly voices = input<readonly SpeechLanguage[]>([]);
  readonly speaking = input(false);
  protected readonly speech = computed(() => {
    const speech = this.item().speech;
    return speech && this.voices().includes(speech.lang) ? speech : null;
  });
  /** The key of the record whose button was pressed. */
  readonly opened = output<string>();
  readonly proposalOpened = output<string>();
  readonly choicePicked = output<string>();
  readonly readAloud = output<void>();
}

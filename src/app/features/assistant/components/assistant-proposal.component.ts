import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ProposalCardView } from '../containers/assistant-view';

/** What the assistant prepared: a short description and the button that opens it, still to be confirmed there. */
@Component({
  selector: 'app-assistant-proposal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-label]="card().title">
      <p class="title" dir="auto">{{ card().title }}</p>
      @if (card().lines.length) {
        <ul>
          @for (line of card().lines; track $index) {
            <li dir="auto">{{ line }}</li>
          }
        </ul>
      }
      @if (card().note; as note) {
        <p class="note">{{ note }}</p>
      }
      <button type="button" class="md-btn md-btn--primary" (click)="opened.emit(card().id)">
        {{ card().action }}
      </button>
    </div>
  `,
  styles: `
    div {
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
      color: var(--md-ink);
    }

    .title {
      margin: 0;
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: 400 14px / var(--md-lh) var(--md-font);
      overflow-wrap: anywhere;
    }

    .note {
      margin: 0;
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    button {
      inline-size: auto;
      align-self: flex-start;
      min-block-size: 40px;
      padding-block: 7px;
      font-size: 14px;
    }
  `,
})
export class AssistantProposalComponent {
  readonly card = input.required<ProposalCardView>();
  readonly opened = output<string>();
}

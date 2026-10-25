import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ConversationItemView } from '../containers/assistant-view';
import { AssistantMessageComponent } from './assistant-message.component';

/** The bubbles in order, a muted line for each lookup that is running, and a notice when something failed. */
@Component({
  selector: 'app-assistant-conversation',
  imports: [AssistantMessageComponent, FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section role="log" aria-live="polite" [attr.aria-label]="label()" [attr.aria-busy]="busy()">
      @for (item of items(); track item.id) {
        <app-assistant-message [item]="item" (opened)="opened.emit($event)" />
      }
      @for (line of activity(); track line) {
        <p class="activity">{{ line }}</p>
      }
    </section>
    @if (problem(); as message) {
      <app-feedback-card tone="warning" [title]="message" />
    }
  `,
  styles: `
    :host,
    section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .activity {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class AssistantConversationComponent {
  readonly label = input.required<string>();
  readonly items = input.required<readonly ConversationItemView[]>();
  readonly activity = input<readonly string[]>([]);
  readonly problem = input<string | null>(null);
  readonly busy = input(false);
  readonly opened = output<string>();
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { DraftCardView } from '../containers/drafts-view';

/** The unfinished documents, one tinted card each with the button that carries the work on. */
@Component({
  selector: 'app-drafts-list',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (card of cards(); track card.id) {
      <app-feedback-card [title]="card.title" [message]="card.meta">
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="card.primary"
          (click)="continued.emit(card.id)"
        >
          {{ card.action }}
        </button>
        @if (card.deletable) {
          <button
            type="button"
            class="md-btn md-btn--danger"
            [disabled]="busy()"
            (click)="deleteAsked.emit(card.id)"
          >
            {{ card.deleteLabel }}
          </button>
        }
      </app-feedback-card>
    } @empty {
      <app-feedback-card [title]="empty().title" [message]="empty().message" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
  `,
})
export class DraftsListComponent {
  readonly cards = input.required<readonly DraftCardView[]>();
  readonly empty = input.required<{ title: string; message: string }>();
  /** A delete is running: no second one may start. */
  readonly busy = input(false);
  readonly continued = output<string>();
  readonly deleteAsked = output<string>();
}

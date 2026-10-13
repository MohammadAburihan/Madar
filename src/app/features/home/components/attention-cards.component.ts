import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { CardView } from '../containers/home-view';

@Component({
  selector: 'app-attention-cards',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (card of cards(); track $index) {
      <app-feedback-card [title]="card.title" [message]="card.message" />
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
export class AttentionCardsComponent {
  readonly cards = input.required<readonly CardView[]>();
  readonly empty = input.required<CardView>();
}

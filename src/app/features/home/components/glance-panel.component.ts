import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { CardView } from '../containers/home-view';

@Component({
  selector: 'app-glance-panel',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ heading() }}</h2>
    @for (card of cards(); track $index) {
      <app-feedback-card [title]="card.title" [message]="card.message" [numeric]="!!card.numeric" />
    }
    <p class="note">{{ note() }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    h2 {
      color: var(--md-ink);
      font: 600 20px / var(--md-lh) var(--md-font);
    }

    .note {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class GlancePanelComponent {
  readonly heading = input.required<string>();
  readonly cards = input.required<readonly CardView[]>();
  readonly note = input.required<string>();
}

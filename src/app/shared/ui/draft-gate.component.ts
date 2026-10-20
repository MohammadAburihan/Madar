import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from './feedback-card.component';

/** What a task shows while the draft it was opened for loads, or instead of an empty form when it can't. */
@Component({
  selector: 'app-draft-gate',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: './task-page.scss',
  template: `
    @if (failed()) {
      <app-feedback-card tone="danger" [title]="title()" [message]="message()" />
      @if (retryLabel()) {
        <button type="button" class="md-btn md-btn--primary" (click)="retry.emit()">
          {{ retryLabel() }}
        </button>
      }
      <button type="button" class="md-btn" (click)="back.emit()">{{ backLabel() }}</button>
    } @else {
      <p class="muted" role="status">{{ loading() }}</p>
    }
  `,
})
export class DraftGateComponent {
  readonly failed = input.required<boolean>();
  readonly loading = input.required<string>();
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly backLabel = input.required<string>();
  /** Only for a failure worth trying again (a lost connection), not for a draft that can't be continued. */
  readonly retryLabel = input<string | null>(null);
  readonly desktop = input(false);
  readonly back = output<void>();
  readonly retry = output<void>();
}

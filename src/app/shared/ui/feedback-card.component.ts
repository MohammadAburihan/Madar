import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type FeedbackTone = 'tint' | 'warning' | 'danger';

@Component({
  selector: 'app-feedback-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tone-' + tone()",
    '[attr.role]': "status() || tone() !== 'tint' ? 'status' : null",
    '[attr.aria-live]': "status() || tone() !== 'tint' ? 'polite' : null",
  },
  template: `
    <p class="title" [attr.dir]="numeric() ? 'ltr' : null">{{ title() }}</p>
    @if (message()) {
      <p class="message">{{ message() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      border-radius: 8px;
      background: var(--md-tint);
    }

    .title {
      color: var(--md-primary);
      font: 600 18px / var(--md-lh) var(--md-font);
    }

    .title[dir='ltr'] {
      text-align: left;
    }

    .message {
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }

    :host(.tone-warning) {
      background: var(--md-warning-bg);
    }

    :host(.tone-warning) .title {
      color: var(--md-warning);
    }

    :host(.tone-danger) {
      background: var(--md-danger-bg);
    }

    :host(.tone-danger) .title {
      color: var(--md-danger);
    }
  `,
})
export class FeedbackCardComponent {
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly tone = input<FeedbackTone>('tint');
  readonly numeric = input(false);
  /** Announce changes to screen readers even in the neutral tone (e.g. loading). */
  readonly status = input(false);
}

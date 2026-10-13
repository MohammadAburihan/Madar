import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Selector / Person: a customer or supplier result that can be picked. */
@Component({
  selector: 'app-person-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class.selected]="selected()"
      [attr.aria-pressed]="selected()"
      (click)="picked.emit()"
    >
      <span class="title">{{ title() }}</span>
      @if (meta()) {
        <span class="meta"
          ><bdi>{{ meta() }}</bdi></span
        >
      }
      @if (balance()) {
        <span class="balance">{{ balance() }}</span>
      }
    </button>
  `,
  styles: `
    button {
      display: flex;
      flex-direction: column;
      gap: 6px;
      inline-size: 100%;
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 8px;
      background: var(--md-surface);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    button.selected {
      border-color: var(--md-primary);
      box-shadow: inset 0 0 0 1px var(--md-primary);
    }

    .title {
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    .meta {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    .balance {
      color: var(--md-primary);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class PersonCardComponent {
  readonly title = input.required<string>();
  readonly meta = input<string | null>(null);
  readonly balance = input<string | null>(null);
  readonly selected = input(false);
  readonly picked = output<void>();
}

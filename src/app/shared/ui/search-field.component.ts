import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { LucideSearch } from '@lucide/angular';

@Component({
  selector: 'app-search-field',
  imports: [LucideSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <span class="control">
        <svg lucideSearch [size]="20" aria-hidden="true"></svg>
        <input
          type="search"
          [placeholder]="placeholder()"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
          (keydown.enter)="submitted.emit(value())"
          (keydown.arrowdown)="$event.preventDefault(); arrowDown.emit()"
          enterkeyhint="search"
          autocomplete="off"
        />
      </span>
    </label>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .label {
      color: var(--md-muted);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .control {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 12px;
      block-size: 48px;
      box-sizing: border-box;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-muted);
    }

    .control:focus-within {
      outline: 3px solid var(--md-primary);
      outline-offset: 2px;
    }

    input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      background: none;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      outline: none;
    }

    input::placeholder {
      color: var(--md-muted);
    }
  `,
})
export class SearchFieldComponent {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly value = model('');
  readonly submitted = output<string>();
  readonly arrowDown = output<void>();
}

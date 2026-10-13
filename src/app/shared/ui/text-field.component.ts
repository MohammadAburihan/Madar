import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Labeled input (Field / Labeled and Money / Amount in the design). */
@Component({
  selector: 'app-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.amount]': "variant() === 'amount'", '[class.invalid]': '!!error()' },
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <span class="control" [class.readonly]="readonly()">
        <input
          [type]="type()"
          [attr.inputmode]="inputmode()"
          [attr.autocomplete]="autocomplete()"
          [attr.dir]="ltr() ? 'ltr' : null"
          [readOnly]="readonly()"
          [attr.aria-invalid]="error() ? true : null"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        @if (suffix()) {
          <span class="suffix">{{ suffix() }}</span>
        }
      </span>
      @if (error()) {
        <span class="error" role="alert">{{ error() }}</span>
      } @else if (hint()) {
        <span class="hint">{{ hint() }}</span>
      }
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
      gap: 16px;
      padding: 0 12px;
      block-size: 48px;
      box-sizing: border-box;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
    }

    .control:focus-within {
      outline: 3px solid var(--md-primary);
      outline-offset: 2px;
    }

    .control.readonly {
      background: var(--md-bg);
    }

    input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      background: none;
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      outline: none;
    }

    .suffix {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    .error {
      color: var(--md-danger);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    .hint {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    :host(.invalid) .control {
      border-color: var(--md-danger);
    }

    :host(.amount) input {
      font-size: 20px;
      font-weight: 600;
    }
  `,
})
export class TextFieldComponent {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly type = input<'text' | 'tel' | 'email' | 'number'>('text');
  readonly inputmode = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);
  readonly suffix = input<string | null>(null);
  readonly readonly = input(false);
  readonly error = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly variant = input<'default' | 'amount'>('default');
  /** Phone numbers, emails and amounts read left to right even in Arabic. */
  readonly ltr = input(false);
}

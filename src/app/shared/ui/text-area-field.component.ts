import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Labeled multi-line input, styled like the text field. */
@Component({
  selector: 'app-text-area-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <textarea
        class="control"
        [attr.rows]="rows()"
        [attr.maxlength]="maxlength()"
        [readOnly]="readonly()"
        [class.readonly]="readonly()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
      ></textarea>
      @if (hint()) {
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
      padding: 11px 12px;
      box-sizing: border-box;
      inline-size: 100%;
      resize: vertical;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
    }

    .control:focus {
      outline: 3px solid var(--md-primary);
      outline-offset: 2px;
    }

    .control.readonly {
      background: var(--md-bg);
    }

    .hint {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class TextAreaFieldComponent {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly hint = input<string | null>(null);
  readonly rows = input(3);
  readonly maxlength = input<number | null>(null);
  readonly readonly = input(false);
}

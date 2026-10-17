import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      <span class="label">{{ label() }}</span>
      <span class="control">
        <select
          [value]="value() ?? ''"
          [disabled]="disabled()"
          (change)="value.set($any($event.target).value || null)"
        >
          @if (placeholder()) {
            <option value="" disabled [selected]="!value()">{{ placeholder() }}</option>
          }
          @for (option of options(); track option.value) {
            <option [value]="option.value" [selected]="option.value === value()">
              {{ option.label }}
            </option>
          }
        </select>
        <span class="arrow" aria-hidden="true">▾</span>
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
      position: relative;
      display: flex;
      align-items: center;
    }

    select {
      appearance: none;
      inline-size: 100%;
      block-size: 48px;
      box-sizing: border-box;
      padding-block: 0;
      padding-inline: 12px 32px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    select:disabled {
      color: var(--md-muted);
      cursor: default;
    }

    .arrow {
      position: absolute;
      inset-inline-end: 12px;
      color: var(--md-ink);
      font-size: 12px;
      pointer-events: none;
    }
  `,
})
export class SelectFieldComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model<string | null>(null);
  readonly placeholder = input<string | null>(null);
  /** Shown but not changeable, e.g. while a save is unresolved. */
  readonly disabled = input(false);
}

import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { SelectOption } from './select-field.component';

@Component({
  selector: 'app-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [class.active]="option.value === value()"
          (click)="value.set(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    div {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    button {
      padding: 12px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: var(--md-tint);
      color: var(--md-primary);
      font: 600 14px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    button.active {
      border-color: var(--md-primary);
    }
  `,
})
export class FilterChipsComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model.required<string>();
}

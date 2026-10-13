import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-quantity-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stepper" role="group" [attr.aria-label]="label()">
      <button type="button" [attr.aria-label]="decreaseLabel()" (click)="changed.emit(value() - 1)">
        −
      </button>
      <output [attr.aria-live]="'polite'">{{ value() }}</output>
      <button type="button" [attr.aria-label]="increaseLabel()" (click)="changed.emit(value() + 1)">
        +
      </button>
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
      align-self: flex-start;
    }

    .stepper {
      display: flex;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
    }

    button,
    output {
      display: grid;
      place-items: center;
      inline-size: 48px;
      block-size: 48px;
      color: var(--md-primary);
      font:
        400 20px / 1 'Inter Variable',
        system-ui,
        sans-serif;
    }

    button {
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }
  `,
})
export class QuantityStepperComponent {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly decreaseLabel = input.required<string>();
  readonly increaseLabel = input.required<string>();
  readonly changed = output<number>();
}

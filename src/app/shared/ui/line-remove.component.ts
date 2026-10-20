import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Remove button for one task line; for rows that stay in the list, an excluded row offers "Add back". */
@Component({
  selector: 'app-line-remove',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (excluded()) {
      <p class="excluded">{{ excludedLabel() }}</p>
      <button
        type="button"
        class="md-btn"
        [attr.aria-label]="addBackName()"
        (click)="addBack.emit()"
      >
        {{ addBackLabel() }}
      </button>
    } @else {
      <button type="button" class="md-btn" [attr.aria-label]="name()" (click)="remove.emit()">
        {{ label() }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .excluded {
      margin: 0;
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class LineRemoveComponent {
  readonly label = input.required<string>();
  /** Accessible name, e.g. "Remove Olive tree". */
  readonly name = input.required<string>();
  readonly excluded = input(false);
  readonly excludedLabel = input('');
  readonly addBackLabel = input('');
  readonly addBackName = input('');
  readonly remove = output<void>();
  readonly addBack = output<void>();
}

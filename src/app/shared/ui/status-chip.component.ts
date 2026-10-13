import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'tone-' + tone()" },
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-block;
      align-self: flex-start;
      padding: 6px 10px;
      border-radius: 6px;
      background: var(--md-tint);
      color: var(--md-primary);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    :host(.tone-warning) {
      background: var(--md-warning-bg);
      color: var(--md-warning);
    }

    :host(.tone-danger) {
      background: var(--md-danger-bg);
      color: var(--md-danger);
    }
  `,
})
export class StatusChipComponent {
  readonly label = input.required<string>();
  readonly tone = input<'tint' | 'warning' | 'danger'>('tint');
}

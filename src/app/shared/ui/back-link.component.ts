import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronLeft } from '@lucide/angular';

@Component({
  selector: 'app-back-link',
  imports: [LucideChevronLeft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="back.emit()">
      <svg lucideChevronLeft [size]="20" aria-hidden="true" class="chevron"></svg>
      <span>{{ label() }}</span>
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-block-size: 48px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--md-primary);
      font: 400 16px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    :host-context([dir='rtl']) .chevron {
      transform: scaleX(-1);
    }
  `,
})
export class BackLinkComponent {
  readonly label = input.required<string>();
  readonly back = output<void>();
}

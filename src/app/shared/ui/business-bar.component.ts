import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';

@Component({
  selector: 'app-business-bar',
  imports: [LucideChevronDown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (interactive()) {
      <button
        type="button"
        class="switch"
        [attr.aria-label]="switchLabel()"
        (click)="switchBusiness.emit()"
      >
        <bdi class="name">{{ businessName() }}</bdi>
        <svg lucideChevronDown [size]="16" aria-hidden="true"></svg>
      </button>
    } @else {
      <bdi class="name static">{{ businessName() }}</bdi>
    }
    <span class="brand">{{ brand() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-block-size: 48px;
      color: var(--md-primary);
    }

    .switch {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-block-size: 48px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: 600 14px / var(--md-lh) var(--md-font);
      text-align: start;
      cursor: pointer;
    }

    .name {
      flex: 1;
    }

    .static {
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .brand {
      font: 700 16px / var(--md-lh) var(--md-font);
    }
  `,
})
export class BusinessBarComponent {
  readonly businessName = input.required<string>();
  readonly brand = input.required<string>();
  readonly switchLabel = input('');
  /** Off where switching isn't possible (e.g. before sign-in), so it isn't a button that does nothing. */
  readonly interactive = input(true);
  readonly switchBusiness = output<void>();
}

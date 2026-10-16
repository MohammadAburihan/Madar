import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronRight } from '@lucide/angular';
import { TotalRow } from '../../../shared/ui/totals-card.component';

/** A headed figure with the rows that make it up, and an optional link to more detail. */
@Component({
  selector: 'app-profit-card',
  imports: [LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }

    .label {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }

    .amount {
      color: var(--md-primary);
      font: 700 28px / var(--md-lh) var(--md-font);
    }

    dl {
      display: grid;
      gap: 8px;
      margin: 0;
      padding-block-start: 12px;
      border-block-start: 1px solid var(--md-line);
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    dt {
      color: var(--md-muted);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    dd {
      margin: 0;
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    button {
      all: unset;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-block-start: 12px;
      border-block-start: 1px solid var(--md-line);
      color: var(--md-primary);
      font: 600 15px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
    }

    :host-context([dir='rtl']) svg {
      transform: scaleX(-1);
    }
  `,
  template: `
    <span class="label">{{ label() }}</span>
    <bdi class="amount" dir="ltr">{{ amount() }}</bdi>
    <dl>
      @for (row of rows(); track row.label) {
        <div class="row">
          <dt>{{ row.label }}</dt>
          <dd>
            <bdi dir="ltr">{{ row.value }}</bdi>
          </dd>
        </div>
      }
    </dl>
    @if (link(); as text) {
      <button type="button" (click)="linkSelected.emit()">
        {{ text }}
        <svg lucideChevronRight [size]="18" aria-hidden="true"></svg>
      </button>
    }
  `,
})
export class ProfitCardComponent {
  readonly label = input.required<string>();
  readonly amount = input.required<string>();
  readonly rows = input.required<readonly TotalRow[]>();
  readonly link = input<string | null>(null);
  readonly linkSelected = output<void>();
}

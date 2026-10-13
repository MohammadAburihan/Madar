import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TotalRow {
  label: string;
  value: string;
  /** Highlights the row's amount, e.g. the balance left after a payment. */
  accent?: boolean;
}

/** Money / Summary: label on the start side, amount as an isolated left-to-right run on the end side. */
@Component({
  selector: 'app-totals-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': "density() === 'compact'" },
  template: `
    <dl>
      @for (row of rows(); track row.label) {
        <div class="row">
          <dt>{{ row.label }}</dt>
          <dd [class.accent]="row.accent">
            <bdi dir="ltr">{{ row.value }}</bdi>
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    dl {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-surface);
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }

    dt {
      color: var(--md-muted);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    dd {
      margin: 0;
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    dd.accent {
      color: var(--md-primary);
    }

    :host(.compact) dl {
      gap: 8px;
      padding: 14px;
    }

    :host(.compact) dt {
      font-size: 13px;
    }

    :host(.compact) dd {
      font-size: 14px;
    }
  `,
})
export class TotalsCardComponent {
  readonly rows = input.required<readonly TotalRow[]>();
  readonly density = input<'regular' | 'compact'>('regular');
}

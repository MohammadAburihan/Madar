import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Metric {
  label: string;
  value: string;
  hint: string;
  /** The headline figure, tinted as on the reports workspace mock. */
  tint: boolean;
}

/** A row of figure cards: label, amount and a line on where it comes from. */
@Component({
  selector: 'app-metric-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .card {
      display: grid;
      align-content: start;
      gap: 4px;
      padding: 15px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-surface);
    }

    .card.tint {
      border-color: var(--md-tint);
      background: var(--md-tint);
    }

    .label,
    .hint {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }

    .hint {
      font-size: 12px;
    }

    bdi {
      color: var(--md-primary);
      font: 700 24px / var(--md-lh) var(--md-font);
    }
  `,
  template: `
    @for (metric of metrics(); track metric.label) {
      <div class="card" [class.tint]="metric.tint">
        <span class="label">{{ metric.label }}</span>
        <bdi dir="ltr">{{ metric.value }}</bdi>
        <span class="hint">{{ metric.hint }}</span>
      </div>
    }
  `,
})
export class MetricCardsComponent {
  readonly metrics = input.required<readonly Metric[]>();
}

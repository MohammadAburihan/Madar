import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Stat {
  label: string;
  value: string;
}

/** A tinted summary of a few figures side by side, e.g. "Locations 2 · Moves today 5". */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl>
      @for (stat of stats(); track stat.label) {
        <div>
          <dt>{{ stat.label }}</dt>
          <dd>
            <bdi>{{ stat.value }}</bdi>
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    dl {
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: 16px;
      margin: 0;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-tint);
    }

    dt {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }

    dd {
      margin: 0;
      color: var(--md-primary);
      font: 700 24px / var(--md-lh) var(--md-font);
    }
  `,
})
export class StatCardComponent {
  readonly stats = input.required<readonly Stat[]>();
}

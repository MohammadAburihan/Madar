import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface BankRow {
  label: string;
  value: string;
  ltr: boolean;
}

/** A contact's saved bank details on its page, one labelled row each. */
@Component({
  selector: 'app-bank-details-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" [attr.aria-label]="title()">
      <h2 class="title">{{ title() }}</h2>
      <dl class="rows">
        @for (row of rows(); track row.label) {
          <div class="row">
            <dt>{{ row.label }}</dt>
            <dd [attr.dir]="row.ltr ? 'ltr' : null" [class.ltr]="row.ltr">{{ row.value }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
    }

    .title {
      margin: 0;
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 16px;
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    dt {
      color: var(--md-muted);
    }

    dd {
      margin: 0;
      color: var(--md-ink);
      overflow-wrap: anywhere;
    }

    dd.ltr {
      text-align: end;
      unicode-bidi: isolate;
    }
  `,
})
export class BankDetailsCardComponent {
  readonly title = input.required<string>();
  readonly rows = input.required<readonly BankRow[]>();
}

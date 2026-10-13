import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface TableRow {
  id: string;
  cells: readonly string[];
}

/** Table / Header and rows from the design: a tinted header and one line per record. */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table [attr.aria-label]="label()">
      <thead>
        <tr>
          @for (header of headers(); track $index) {
            <th scope="col">{{ header }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr
            [class.interactive]="interactive()"
            [attr.tabindex]="interactive() ? 0 : null"
            (click)="interactive() && opened.emit(row.id)"
            (keydown.enter)="interactive() && opened.emit(row.id)"
          >
            @for (cell of row.cells; track $index) {
              <td>
                <bdi [attr.dir]="ltrColumns().includes($index) ? 'ltr' : null">{{ cell }}</bdi>
              </td>
            }
          </tr>
        } @empty {
          <tr>
            <td class="empty" [attr.colspan]="headers().length">{{ empty() }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--md-line);
      border-radius: 8px;
      background: var(--md-surface);
      overflow: hidden;
    }

    table {
      inline-size: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      padding: 16px;
      text-align: start;
      vertical-align: top;
    }

    th {
      background: var(--md-tint);
      color: var(--md-primary);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    td {
      border-block-start: 1px solid var(--md-line);
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    tr.interactive {
      cursor: pointer;
    }

    tr.interactive:hover,
    tr.interactive:focus-visible {
      background: var(--md-bg);
      outline: none;
    }

    .empty {
      color: var(--md-muted);
    }
  `,
})
export class DataTableComponent {
  readonly headers = input.required<readonly string[]>();
  readonly rows = input.required<readonly TableRow[]>();
  readonly label = input.required<string>();
  readonly empty = input('');
  /** Column indexes holding amounts or identifiers, kept as left-to-right runs in Arabic. */
  readonly ltrColumns = input<readonly number[]>([]);
  readonly interactive = input(false);
  readonly opened = output<string>();
}

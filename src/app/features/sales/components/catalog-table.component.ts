import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChildren,
} from '@angular/core';

export interface CatalogRow {
  code: string;
  title: string;
  availability: string;
  price: string;
}

export interface CatalogHeaders {
  item: string;
  availability: string;
  price: string;
}

/** Desktop catalog: arrow keys move between rows, Enter or click adds the row to the sale. */
@Component({
  selector: 'app-catalog-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table" role="grid" [attr.aria-label]="label()">
      <div class="row head" role="row">
        <span role="columnheader">{{ headers().item }}</span>
        <span role="columnheader">{{ headers().availability }}</span>
        <span role="columnheader">{{ headers().price }}</span>
      </div>
      @for (row of rows(); track row.code; let i = $index) {
        <button
          #rowButton
          type="button"
          class="row"
          role="row"
          (click)="added.emit(row.code)"
          (keydown.arrowdown)="$event.preventDefault(); focusRow(i + 1)"
          (keydown.arrowup)="$event.preventDefault(); focusRow(i - 1)"
        >
          <span role="gridcell"
            ><bdi>{{ row.title }}</bdi></span
          >
          <span role="gridcell">{{ row.availability }}</span>
          <span role="gridcell"
            ><bdi dir="ltr">{{ row.price }}</bdi></span
          >
        </button>
      } @empty {
        <p class="empty">{{ empty() }}</p>
      }
    </div>
  `,
  styles: `
    .table {
      border: 1px solid var(--md-line);
      border-radius: 8px;
      background: var(--md-surface);
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      inline-size: 100%;
      box-sizing: border-box;
      padding: 16px;
      border: 0;
      border-block-end: 1px solid var(--md-line);
      background: none;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      text-align: start;
    }

    button.row {
      cursor: pointer;
    }

    button.row:hover,
    button.row:focus-visible {
      background: var(--md-bg);
    }

    button.row:last-child {
      border-block-end: 0;
    }

    .head {
      background: var(--md-tint);
      border-block-end: 0;
      color: var(--md-primary);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .empty {
      margin: 0;
      padding: 16px;
      color: var(--md-muted);
      font: 400 15px / var(--md-lh) var(--md-font);
    }
  `,
})
export class CatalogTableComponent {
  readonly rows = input.required<readonly CatalogRow[]>();
  readonly headers = input.required<CatalogHeaders>();
  readonly label = input.required<string>();
  readonly empty = input('');
  readonly added = output<string>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('rowButton');

  /** Called by the search field's arrow-down so keyboard users can reach the results. */
  focusRow(index: number): void {
    const buttons = this.buttons();
    buttons[Math.max(0, Math.min(index, buttons.length - 1))]?.nativeElement.focus();
  }
}

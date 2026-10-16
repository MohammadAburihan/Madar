import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';

export interface SectionItem {
  title: string;
  message: string;
}

export interface SectionRow {
  label: string;
  status: string;
  /** Flags a shortfall, as on the requirement mock. */
  short: boolean;
}

/** A headed card on the project overview: text items, labelled status rows, or projected content. */
@Component({
  selector: 'app-project-section',
  imports: [StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }

    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    .box {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }

    .item {
      display: grid;
      gap: 2px;
    }

    .item strong {
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    .item span,
    .empty {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }

    /* Zero specificity, so .row's layout still applies to the button. */
    :where(button.row) {
      all: unset;
      cursor: pointer;
    }

    button.row:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 4px;
      border-radius: 8px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    .empty {
      margin: 0;
    }
  `,
  template: `
    <h2>{{ heading() }}</h2>
    @if (filled()) {
      <div class="box">
        @for (item of items(); track $index) {
          <div class="item">
            <strong>{{ item.title }}</strong>
            <span>{{ item.message }}</span>
          </div>
        }
        @for (row of rows(); track $index; let i = $index) {
          @if (rowsInteractive()) {
            <button type="button" class="row" (click)="rowSelected.emit(i)">
              <span>{{ row.label }}</span>
              <app-status-chip [label]="row.status" [tone]="row.short ? 'warning' : 'tint'" />
            </button>
          } @else {
            <div class="row">
              <span>{{ row.label }}</span>
              <app-status-chip [label]="row.status" [tone]="row.short ? 'warning' : 'tint'" />
            </div>
          }
        }
        <ng-content />
      </div>
    } @else {
      <p class="empty">{{ empty() }}</p>
    }
  `,
})
export class ProjectSectionComponent {
  readonly heading = input.required<string>();
  readonly items = input<readonly SectionItem[]>([]);
  readonly rows = input<readonly SectionRow[]>([]);
  readonly empty = input.required<string>();
  /** Set when the content is projected rather than passed as items or rows. */
  readonly hasContent = input(false);
  /** Rows open something (a requirement's supply plan). */
  readonly rowsInteractive = input(false);
  readonly rowSelected = output<number>();

  protected readonly filled = computed(
    () => this.hasContent() || this.items().length > 0 || this.rows().length > 0,
  );
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface HistoryEntry {
  title: string;
  meta: string;
}

/** A compact list of past events: a bold line and a muted detail line each. */
@Component({
  selector: 'app-history-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul [attr.aria-label]="label()">
      @for (entry of entries(); track $index) {
        <li>
          <span class="title"
            ><bdi>{{ entry.title }}</bdi></span
          >
          <span class="meta"
            ><bdi>{{ entry.meta }}</bdi></span
          >
        </li>
      } @empty {
        <li class="meta">{{ empty() }}</li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-surface);
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
    }

    .title {
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    .meta {
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }
  `,
})
export class HistoryListComponent {
  readonly entries = input.required<readonly HistoryEntry[]>();
  readonly label = input.required<string>();
  readonly empty = input('');
}

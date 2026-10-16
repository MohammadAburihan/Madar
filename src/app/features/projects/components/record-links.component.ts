import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface RecordLinkItem {
  id: string;
  label: string;
  openable: boolean;
}

/** Project records on the desktop workspace: one outlined link per record, plain text where there is no page. */
@Component({
  selector: 'app-record-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      background: var(--md-surface);
    }

    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    .static {
      padding: 11px 16px;
      border: 1px solid var(--md-line);
      border-radius: 10px;
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
      text-align: center;
    }

    .empty {
      margin: 0;
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
    }
  `,
  template: `
    <h2>{{ heading() }}</h2>
    @for (link of links(); track link.id) {
      @if (link.openable) {
        <button type="button" class="md-btn" (click)="opened.emit(link.id)">
          <bdi>{{ link.label }}</bdi>
        </button>
      } @else {
        <div class="static">
          <bdi>{{ link.label }}</bdi>
        </div>
      }
    } @empty {
      <p class="empty">{{ empty() }}</p>
    }
  `,
})
export class RecordLinksComponent {
  readonly heading = input.required<string>();
  readonly links = input.required<readonly RecordLinkItem[]>();
  readonly empty = input('');
  readonly opened = output<string>();
}

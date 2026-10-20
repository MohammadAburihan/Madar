import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { DraftTarget } from '../containers/drafts-view';
import { AttentionRow, CardView } from '../containers/home-view';

export interface AttentionHeaders {
  work: string;
  due: string;
  next: string;
}

/** Grid-based so columns match the design's equal widths; ARIA roles keep table semantics. */
@Component({
  selector: 'app-attention-table',
  imports: [FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <div class="table" role="table">
        <div class="row head" role="row">
          <span role="columnheader">{{ headers().work }}</span>
          <span role="columnheader">{{ headers().due }}</span>
          <span role="columnheader">{{ headers().next }}</span>
        </div>
        @for (row of rows(); track $index) {
          <div class="row" role="row">
            <span role="cell"
              ><bdi>{{ row.work }}</bdi></span
            >
            <span role="cell">{{ row.due }}</span>
            <span role="cell">
              @if (row.target; as target) {
                <button type="button" class="link" (click)="opened.emit(target)">
                  {{ row.next }}
                </button>
              } @else {
                {{ row.next }}
              }
            </span>
          </div>
        }
      </div>
    } @else {
      <app-feedback-card [title]="empty().title" [message]="empty().message" />
    }
  `,
  styles: `
    :host {
      display: block;
    }

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
      padding: 16px;
      border-block-end: 1px solid var(--md-line);
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    .link {
      all: unset;
      cursor: pointer;
      color: var(--md-primary);
      font-weight: 600;
      text-decoration: underline;
    }

    .link:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
    }

    .head {
      background: var(--md-tint);
      border-block-end: 0;
      color: var(--md-primary);
      font: 600 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class AttentionTableComponent {
  readonly headers = input.required<AttentionHeaders>();
  readonly rows = input.required<readonly AttentionRow[]>();
  readonly empty = input.required<CardView>();
  readonly opened = output<DraftTarget>();
}

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronRight } from '@lucide/angular';

export interface StatementEntryCard {
  id: string;
  title: string;
  date: string;
  amount: string;
  balance: string;
  openable: boolean;
}

/** A statement's entries on a phone: document and date, the amount and the balance after it. */
@Component({
  selector: 'app-statement-entries',
  imports: [LucideChevronRight, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }

    .entry {
      display: grid;
      grid-template-columns: 1fr auto 20px;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-block-end: 1px solid var(--md-line);
    }

    .entry:last-child {
      border-block-end: 0;
    }

    :where(button.entry) {
      all: unset;
      cursor: pointer;
    }

    button.entry:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: -2px;
    }

    .side {
      display: grid;
      justify-items: end;
    }

    strong {
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }

    small {
      color: var(--md-muted);
      font: 400 12px / var(--md-lh) var(--md-font);
    }

    :host-context([dir='rtl']) svg {
      transform: scaleX(-1);
    }
  `,
  template: `
    @for (entry of entries(); track entry.id) {
      @if (entry.openable) {
        <button type="button" class="entry" (click)="opened.emit(entry.id)">
          <ng-container *ngTemplateOutlet="body; context: { $implicit: entry }" />
          <svg lucideChevronRight [size]="18" aria-hidden="true"></svg>
        </button>
      } @else {
        <div class="entry">
          <ng-container *ngTemplateOutlet="body; context: { $implicit: entry }" />
          <span></span>
        </div>
      }
    }
    <ng-template #body let-entry>
      <span>
        <strong
          ><bdi>{{ entry.title }}</bdi></strong
        ><br />
        <small
          ><bdi dir="ltr">{{ entry.date }}</bdi></small
        >
      </span>
      <span class="side">
        <strong
          ><bdi dir="ltr">{{ entry.amount }}</bdi></strong
        >
        <small
          ><bdi>{{ entry.balance }}</bdi></small
        >
      </span>
    </ng-template>
  `,
})
export class StatementEntriesComponent {
  readonly entries = input.required<readonly StatementEntryCard[]>();
  readonly opened = output<string>();
}

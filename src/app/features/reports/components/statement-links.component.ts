import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideChevronRight, LucideTruck, LucideUser } from '@lucide/angular';

export interface StatementLink {
  id: 'customer' | 'supplier';
  title: string;
  message: string;
  /** "Choose a customer first", shown under the card on phones. */
  action: string | null;
}

/** The two statement cards on the reports page: customer and supplier. */
@Component({
  selector: 'app-statement-links',
  imports: [LucideChevronRight, LucideTruck, LucideUser],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.row]': 'row()' },
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }

    :host(.row) {
      grid-template-columns: 1fr 1fr;
    }

    button {
      all: unset;
      display: grid;
      grid-template-columns: 48px 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
    }

    .icon {
      display: grid;
      place-items: center;
      inline-size: 48px;
      block-size: 48px;
      border-radius: 10px;
      background: var(--md-tint);
      color: var(--md-primary);
    }

    strong {
      display: block;
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    span.text {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    .action {
      display: block;
      margin-block-start: 6px;
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    :host-context([dir='rtl']) .chevron {
      transform: scaleX(-1);
    }
  `,
  template: `
    @for (link of links(); track link.id) {
      <button type="button" (click)="opened.emit(link.id)">
        <span class="icon" aria-hidden="true">
          @if (link.id === 'customer') {
            <svg lucideUser [size]="22"></svg>
          } @else {
            <svg lucideTruck [size]="22"></svg>
          }
        </span>
        <span>
          <strong>{{ link.title }}</strong>
          <span class="text">{{ link.message }}</span>
          @if (link.action) {
            <span class="action">{{ link.action }}</span>
          }
        </span>
        <svg lucideChevronRight [size]="18" aria-hidden="true" class="chevron"></svg>
      </button>
    }
  `,
})
export class StatementLinksComponent {
  readonly links = input.required<readonly StatementLink[]>();
  /** Side by side, as on the desktop workspace. */
  readonly row = input(false);
  readonly opened = output<'customer' | 'supplier'>();
}

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideSprout, LucideWrench } from '@lucide/angular';

/** List / Item: icon tile, title, meta line, and a detail line in the primary colour. */
@Component({
  selector: 'app-item-card',
  imports: [LucideSprout, LucideWrench, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.interactive]': 'interactive()' },
  template: `
    @if (interactive()) {
      <button type="button" class="card" (click)="selected.emit()">
        <ng-container *ngTemplateOutlet="body" />
      </button>
    } @else {
      <div class="card"><ng-container *ngTemplateOutlet="body" /></div>
    }
    <ng-template #body>
      <span class="identity">
        <span class="icon" aria-hidden="true">
          @if (kind() === 'service') {
            <svg lucideWrench [size]="24"></svg>
          } @else {
            <svg lucideSprout [size]="24"></svg>
          }
        </span>
        <span class="text">
          <span class="title">{{ title() }}</span>
          @if (meta()) {
            <span class="meta">{{ meta() }}</span>
          }
        </span>
      </span>
      @if (detail()) {
        <span class="detail">{{ detail() }}</span>
      }
    </ng-template>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      inline-size: 100%;
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid var(--md-line);
      border-radius: 8px;
      background: var(--md-surface);
      color: inherit;
      font: inherit;
      text-align: start;
    }

    button.card {
      cursor: pointer;
    }

    button.card:hover {
      border-color: var(--md-control);
    }

    .identity {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .icon {
      display: grid;
      flex: none;
      place-items: center;
      inline-size: 48px;
      block-size: 48px;
      border-radius: 8px;
      background: var(--md-tint);
      color: var(--md-primary);
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-inline-size: 0;
    }

    .title {
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    .meta {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    .detail {
      color: var(--md-primary);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class ItemCardComponent {
  readonly title = input.required<string>();
  readonly meta = input<string | null>(null);
  readonly detail = input<string | null>(null);
  readonly kind = input<'product' | 'service'>('product');
  readonly interactive = input(false);
  readonly selected = output<void>();
}

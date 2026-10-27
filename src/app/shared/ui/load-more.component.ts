import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The end of a paged list: asks for the next page when it scrolls into view, and always offers a "Show more"
 * button for keyboard and screen-reader users and for tables.
 */
@Component({
  selector: 'app-load-more',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasMore()) {
      <div class="more">
        <span #sentinel class="sentinel" aria-hidden="true"></span>
        @if (failed()) {
          <p class="muted" role="alert">{{ 'paging.failed' | transloco }}</p>
          <button type="button" class="md-btn" (click)="more.emit()">
            {{ 'paging.retry' | transloco }}
          </button>
        } @else if (loading()) {
          <p class="muted" role="status">{{ 'paging.loading' | transloco }}</p>
        } @else {
          <button type="button" class="md-btn" (click)="more.emit()">
            {{ 'paging.more' | transloco }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      position: relative;
    }

    .sentinel {
      position: absolute;
      inset-inline: 0;
      inset-block-start: -15vh;
      block-size: 1px;
      pointer-events: none;
    }

    .muted {
      margin: 0;
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class LoadMoreComponent {
  readonly hasMore = input(false);
  readonly loading = input(false);
  readonly failed = input(false);
  readonly more = output<void>();

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer: IntersectionObserver | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
    effect(() => {
      const target = this.sentinel()?.nativeElement;
      const idle = !this.loading() && !this.failed();
      this.observer?.disconnect();
      this.observer = null;
      if (!target || !idle || typeof IntersectionObserver === 'undefined') {
        return;
      }
      // A fresh observer reports the current state, so a page that still ends in view asks for the next one.
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.more.emit();
        }
      });
      this.observer.observe(target);
    });
  }
}

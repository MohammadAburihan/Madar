import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Task title and subtitle. On desktop, projected content becomes the 180px action column. */
@Component({
  selector: 'app-page-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': "layout() === 'desktop'" },
  template: `
    <div class="text">
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <p>{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    h1 {
      color: var(--md-ink);
      font: 600 28px / var(--md-lh) var(--md-font);
    }

    p {
      color: var(--md-muted);
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    .actions:empty {
      display: none;
    }

    :host(.desktop) {
      flex-direction: row;
      align-items: center;
      gap: 24px;

      .text {
        flex: 1;
        gap: 6px;
      }

      h1 {
        font-size: 32px;
      }

      p {
        font-size: 16px;
      }

      .actions {
        flex: none;
        inline-size: 180px;
      }
    }
  `,
})
export class PageHeadingComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly layout = input<'mobile' | 'desktop'>('mobile');
}

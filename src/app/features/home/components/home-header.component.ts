import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-home-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': "layout() === 'desktop'" },
  template: `
    <div class="text">
      <h1>{{ title() }}</h1>
      <p>{{ subtitle() }}</p>
    </div>
    <button type="button" class="md-btn md-btn--primary new" (click)="createNew.emit()">
      {{ newLabel() }}
    </button>
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

      .new {
        inline-size: 180px;
        flex: none;
      }
    }
  `,
})
export class HomeHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly newLabel = input.required<string>();
  readonly layout = input<'mobile' | 'desktop'>('mobile');
  readonly createNew = output<void>();
}

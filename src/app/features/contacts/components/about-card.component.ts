import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** What a contact supplies, or who they are, as the user wrote it. */
@Component({
  selector: 'app-about-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" [attr.aria-label]="title()">
      <h2 class="title">{{ title() }}</h2>
      <p class="text" dir="auto">{{ text() }}</p>
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
    }

    .title {
      margin: 0;
      color: var(--md-ink);
      font: 600 16px / var(--md-lh) var(--md-font);
    }

    .text {
      margin: 0;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class AboutCardComponent {
  readonly title = input.required<string>();
  readonly text = input.required<string>();
}

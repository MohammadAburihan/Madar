import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideExternalLink } from '@lucide/angular';

@Component({
  selector: 'app-open-desk-row',
  imports: [LucideExternalLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [attr.aria-label]="ariaLabel()" (click)="open.emit()">
      <span class="text">
        <span class="label">{{ label() }}</span>
        <span class="hint">{{ hint() }}</span>
      </span>
      <svg lucideExternalLink [size]="20" aria-hidden="true"></svg>
    </button>
  `,
  styles: `
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      inline-size: 100%;
      box-sizing: border-box;
      min-block-size: 56px;
      padding: 8px 16px;
      border: 1px solid var(--md-line);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      text-align: start;
      cursor: pointer;
    }
    .text {
      display: flex;
      flex-direction: column;
    }
    .label {
      color: var(--md-primary);
      font-weight: 600;
    }
    .hint {
      color: var(--md-muted);
      font-size: 13px;
    }
  `,
})
export class OpenDeskRowComponent {
  readonly label = input.required<string>();
  readonly hint = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly open = output<void>();
}

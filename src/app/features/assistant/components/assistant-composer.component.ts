import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { LucideDynamicIcon, LucideSend, LucideSquare } from '@lucide/angular';

/** The note about what the assistant does, the message field, Send, and Stop while an answer is coming. */
@Component({
  selector: 'app-assistant-composer',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="note">{{ note() }}</p>
    <div class="row">
      <textarea
        rows="1"
        dir="auto"
        [attr.aria-label]="label()"
        [placeholder]="placeholder()"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        (keydown.enter)="enter($event)"
      ></textarea>
      @if (busy()) {
        <button type="button" class="md-btn stop" (click)="stop.emit()">
          <svg [lucideIcon]="stopIcon" [size]="16" aria-hidden="true"></svg>
          <span>{{ stopLabel() }}</span>
        </button>
      }
      <button
        type="button"
        class="md-btn md-btn--primary send"
        [attr.aria-label]="sendLabel()"
        [disabled]="busy() || !value().trim()"
        (click)="submit()"
      >
        <svg [lucideIcon]="sendIcon" [size]="20" aria-hidden="true"></svg>
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .note {
      color: var(--md-muted);
      font: 400 14px / var(--md-lh) var(--md-font);
    }

    .row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    textarea {
      flex: 1;
      min-inline-size: 0;
      box-sizing: border-box;
      min-block-size: 48px;
      max-block-size: 160px;
      padding: 11px 12px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / 1.5 var(--md-font);
      field-sizing: content;
      resize: none;
    }

    textarea::placeholder {
      color: var(--md-muted);
    }

    .md-btn {
      flex: none;
      inline-size: auto;
      gap: 8px;
    }

    .send {
      inline-size: 48px;
      padding: 0;
      justify-content: center;
    }

    :host-context([dir='rtl']) .send svg {
      transform: scaleX(-1);
    }
  `,
})
export class AssistantComposerComponent {
  protected readonly sendIcon = LucideSend;
  protected readonly stopIcon = LucideSquare;

  readonly value = model('');
  readonly label = input.required<string>();
  readonly placeholder = input.required<string>();
  readonly note = input.required<string>();
  readonly sendLabel = input.required<string>();
  readonly stopLabel = input.required<string>();
  /** An answer is being written: Send waits and Stop is offered. */
  readonly busy = input(false);
  readonly send = output<string>();
  readonly stop = output<void>();

  protected enter(event: Event): void {
    const key = event as KeyboardEvent;
    // Shift+Enter is a new line, and Enter while an input method is composing picks a candidate.
    if (key.shiftKey || key.isComposing) {
      return;
    }
    key.preventDefault();
    this.submit();
  }

  protected submit(): void {
    const text = this.value().trim();
    if (text && !this.busy()) {
      this.send.emit(text);
    }
  }
}

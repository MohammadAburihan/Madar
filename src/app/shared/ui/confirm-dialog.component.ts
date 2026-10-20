import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

export interface DialogAction {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

/** Modal built on <dialog>, so focus is trapped and Escape cancels natively. */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      (cancel)="$event.preventDefault(); chosen.emit(cancelId())"
      [attr.aria-labelledby]="'dialog-title'"
    >
      <h2 id="dialog-title">{{ title() }}</h2>
      <p>{{ message() }}</p>
      <div class="actions">
        @for (action of actions(); track action.id) {
          <button
            type="button"
            class="md-btn"
            [class.md-btn--primary]="action.primary"
            [class.md-btn--danger]="action.danger"
            (click)="chosen.emit(action.id)"
          >
            {{ action.label }}
          </button>
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      inline-size: min(420px, calc(100vw - 40px));
      box-sizing: border-box;
      padding: 20px;
      border: 0;
      border-radius: 8px;
      background: var(--md-tint);
      color: var(--md-ink);
    }

    dialog::backdrop {
      background: rgb(24 46 43 / 40%);
    }

    h2 {
      margin: 0 0 12px;
      color: var(--md-primary);
      font: 600 18px / var(--md-lh) var(--md-font);
    }

    p {
      margin: 0 0 20px;
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actions = input.required<readonly DialogAction[]>();
  readonly cancelId = input('stay');
  readonly chosen = output<string>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }
}

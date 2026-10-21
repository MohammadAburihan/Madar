import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ConfirmDialogComponent, DialogAction } from './confirm-dialog.component';
import { FeedbackCardComponent } from './feedback-card.component';

export interface DraftDeleteDialog {
  title: string;
  message: string;
  confirm: string;
  keep: string;
}

/** "Delete draft" with its confirmation dialog and, when a delete failed, the reason above the button. */
@Component({
  selector: 'app-draft-delete',
  imports: [ConfirmDialogComponent, FeedbackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problem(); as p) {
      <app-feedback-card tone="danger" [title]="p.title" [message]="p.message" />
    }
    @if (canDelete()) {
      <button
        type="button"
        class="md-btn md-btn--danger"
        [disabled]="busy()"
        (click)="asked.emit()"
      >
        {{ busy() ? busyLabel() : label() }}
      </button>
    }
    @if (dialog(); as d) {
      <app-confirm-dialog
        [open]="open()"
        [title]="d.title"
        [message]="d.message"
        [actions]="actions()"
        cancelId="keep"
        (chosen)="chosen.emit($event)"
      />
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class DraftDeleteComponent {
  readonly label = input.required<string>();
  readonly busyLabel = input.required<string>();
  /** The user may delete this draft; a failure from an earlier try still shows without it. */
  readonly canDelete = input(false);
  readonly busy = input(false);
  readonly open = input(false);
  readonly dialog = input<DraftDeleteDialog | null>(null);
  readonly problem = input<{ title: string; message: string } | null>(null);
  readonly asked = output<void>();
  readonly chosen = output<string>();

  protected readonly actions = computed<DialogAction[]>(() => {
    const d = this.dialog();
    return d
      ? [
          { id: 'delete', label: d.confirm, danger: true },
          { id: 'keep', label: d.keep },
        ]
      : [];
  });
}

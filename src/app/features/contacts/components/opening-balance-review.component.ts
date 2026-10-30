import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalRow, TotalsCardComponent } from '../../../shared/ui/totals-card.component';

export interface OpeningReviewText {
  ready: string;
  record: string;
  recording: string;
  edit: string;
  startOver: string;
  reference: string;
}

/** Step 2 of an opening balance: what will be recorded, before it is. */
@Component({
  selector: 'app-opening-balance-review',
  imports: [FeedbackCardComponent, StatusChipComponent, TotalsCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-status-chip [label]="text().ready" />
    <app-feedback-card [title]="title()" [message]="message()" />
    <app-totals-card density="compact" [rows]="rows()" />
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="busy()"
      (click)="record.emit()"
    >
      {{ busy() ? text().recording : text().record }}
    </button>
    @if (canEdit()) {
      <button type="button" class="md-btn" [disabled]="busy()" (click)="edit.emit()">
        {{ text().edit }}
      </button>
    }
    @if (canStartOver()) {
      <button type="button" class="md-btn" [disabled]="busy()" (click)="startOver.emit()">
        {{ text().startOver }}
      </button>
    }
    <p class="muted">{{ text().reference }}</p>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class OpeningBalanceReviewComponent {
  readonly text = input.required<OpeningReviewText>();
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly rows = input.required<readonly TotalRow[]>();
  readonly busy = input(false);
  /** The details can be changed again; not after a lost answer, whose request may still land. */
  readonly canEdit = input(true);
  /** "Check result" found nothing: the user may drop the task instead of recording it again. */
  readonly canStartOver = input(false);
  readonly startOver = output<void>();
  readonly record = output<void>();
  readonly edit = output<void>();
}

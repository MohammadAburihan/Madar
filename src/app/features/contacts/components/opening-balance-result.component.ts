import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';

export interface OpeningResultText {
  recorded: string;
  viewInvoice: string;
  done: string;
}

/** Step 3 of an opening balance: the recorded invoice, with a way to open it. */
@Component({
  selector: 'app-opening-balance-result',
  imports: [FeedbackCardComponent, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-status-chip [label]="text().recorded" />
    <app-feedback-card [title]="title()" [message]="message()" />
    <button type="button" class="md-btn md-btn--primary" (click)="viewInvoice.emit()">
      {{ text().viewInvoice }}
    </button>
    <button type="button" class="md-btn" (click)="done.emit()">{{ text().done }}</button>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class OpeningBalanceResultComponent {
  readonly text = input.required<OpeningResultText>();
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly viewInvoice = output<void>();
  readonly done = output<void>();
}

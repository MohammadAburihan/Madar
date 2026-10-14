import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalRow, TotalsCardComponent } from '../../../shared/ui/totals-card.component';

/** A supplier invoice's status chips, its totals, and the payments made against it. */
@Component({
  selector: 'app-invoice-summary',
  imports: [FeedbackCardComponent, StatusChipComponent, TotalsCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    @for (chip of chips(); track chip.label) {
      <app-status-chip [label]="chip.label" [tone]="chip.tone" />
    }
    <app-totals-card density="compact" [rows]="totals()" />
    @for (payment of payments(); track payment.title) {
      <app-feedback-card [title]="payment.title" [message]="payment.message" />
    }
  `,
})
export class InvoiceSummaryComponent {
  readonly chips = input.required<readonly { label: string; tone: 'tint' | 'warning' }[]>();
  readonly totals = input.required<readonly TotalRow[]>();
  readonly payments = input<readonly { title: string; message: string }[]>([]);
}

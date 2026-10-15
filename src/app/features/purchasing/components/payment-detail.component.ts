import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PaymentResultView } from '../containers/payment-view';

/** A recorded supplier payment: its status, what it paid, the invoice totals and the account. */
@Component({
  selector: 'app-payment-detail',
  imports: [FeedbackCardComponent, StatusChipComponent, TextFieldComponent, TotalsCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    @let v = view();
    <app-status-chip [label]="v.chip.label" [tone]="v.chip.tone" />
    <app-feedback-card [title]="v.cardTitle" [message]="v.cardMessage" />
    <app-totals-card density="compact" [rows]="v.totals" />
    <app-text-field [label]="paidFromLabel()" [value]="v.paidFrom" [readonly]="true" />
  `,
})
export class PaymentDetailComponent {
  readonly view = input.required<PaymentResultView>();
  readonly paidFromLabel = input.required<string>();
}

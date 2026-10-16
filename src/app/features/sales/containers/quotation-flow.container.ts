import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { QuotationStore } from '../data-access/quotation.store';

/**
 * Hosts the "New quotation" steps. It is created only when the task is entered from elsewhere, so that is where a
 * fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-quotation-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class QuotationFlowContainer {
  constructor() {
    inject(QuotationStore).resume();
  }
}

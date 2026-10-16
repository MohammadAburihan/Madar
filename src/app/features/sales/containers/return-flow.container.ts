import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { SalesReturnStore } from '../data-access/sales-return.store';

/**
 * Hosts the "Return from sale" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-return-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class ReturnFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the invoice before this component's inputs are set.
    const invoice = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
    inject(SalesReturnStore).resume(invoice);
  }
}

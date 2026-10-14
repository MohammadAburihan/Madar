import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { ReceiptStore } from '../data-access/receipt.store';

/**
 * Hosts the "Receive items" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-receipt-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class ReceiptFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the order before this component's inputs are set.
    const order = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
    inject(ReceiptStore).resume(order);
  }
}

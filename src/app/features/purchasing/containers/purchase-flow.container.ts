import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { PurchaseOrderStore } from '../data-access/purchase-order.store';

/**
 * Hosts the "New purchase order" steps. It is created only when the task is entered from elsewhere, so that
 * is where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-purchase-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class PurchaseFlowContainer {
  constructor() {
    // Back from "Add item" (`from=catalog`): the order the user left is still theirs.
    const from = inject(ActivatedRoute).snapshot.queryParamMap.get('from');
    inject(PurchaseOrderStore).resume(from === 'catalog');
  }
}

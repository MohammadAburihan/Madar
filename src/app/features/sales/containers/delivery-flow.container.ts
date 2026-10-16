import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { DeliveryStore } from '../data-access/delivery.store';

/**
 * Hosts the "Deliver order" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-delivery-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class DeliveryFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the order before this component's inputs are set.
    const order = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
    inject(DeliveryStore).resume(order);
  }
}

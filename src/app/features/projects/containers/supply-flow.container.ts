import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { SupplyStore } from '../data-access/supply.store';

/**
 * Hosts the "Supply a project" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-supply-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class SupplyFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the project and item before this component's inputs are set.
    const params = inject(ActivatedRoute).snapshot.paramMap;
    inject(SupplyStore).resume(params.get('name') ?? '', params.get('item') ?? '');
  }
}

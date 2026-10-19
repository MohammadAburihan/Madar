import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AddStockStore } from '../data-access/add-stock.store';

/**
 * Hosts the "Add stock" steps. It is created only when the task is entered from elsewhere, so that is where a
 * fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-add-stock-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class AddStockFlowContainer {
  constructor() {
    inject(AddStockStore).resume();
  }
}

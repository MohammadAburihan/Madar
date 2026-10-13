import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CollectionStore } from '../data-access/collection.store';

/**
 * Hosts the "Receive payment" steps. It is created only when the task is entered from elsewhere, so that
 * is where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-collect-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class CollectFlowContainer {
  constructor() {
    inject(CollectionStore).resume();
  }
}

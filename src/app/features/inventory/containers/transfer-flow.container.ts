import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TransferStore } from '../data-access/transfer.store';

/**
 * Hosts the "Move stock" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-transfer-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class TransferFlowContainer {
  constructor() {
    inject(TransferStore).resume();
  }
}

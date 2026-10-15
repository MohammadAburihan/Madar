import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ExpenseStore } from '../data-access/expense.store';

/**
 * Hosts the "Record expense" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-expense-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class ExpenseFlowContainer {
  constructor() {
    inject(ExpenseStore).resume();
  }
}

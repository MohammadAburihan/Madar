import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { SupplierInvoiceStore } from '../data-access/supplier-invoice.store';

/**
 * Hosts the "Record supplier invoice" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-invoice-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class InvoiceFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the order before this component's inputs are set.
    const order = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
    inject(SupplierInvoiceStore).resume(order);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { draftGateText, injectDraftEntry } from '../../../core/tasks/draft-entry';
import { DraftGateComponent } from '../../../shared/ui/draft-gate.component';
import { SupplierPaymentStore } from '../data-access/supplier-payment.store';

/**
 * Hosts the "Pay supplier" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 * `?draft=<payment>` continues a saved payment instead.
 */
@Component({
  selector: 'app-pay-flow',
  imports: [DraftGateComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry.phase() === 'ready') {
      <router-outlet />
    } @else {
      <app-draft-gate
        [failed]="entry.phase() !== 'loading'"
        [desktop]="desktop()"
        [loading]="gate().loading"
        [title]="gate().title"
        [message]="gate().message"
        [backLabel]="gate().back"
        [retryLabel]="entry.phase() === 'error' ? gate().retry : null"
        (back)="router.navigate(['/drafts'])"
        (retry)="entry.retry()"
      />
    }
  `,
})
export class PayFlowContainer {
  private readonly store = inject(SupplierPaymentStore);
  private readonly i18n = injectI18n();
  protected readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  // The form itself sends a task with an open confirmation on to its checking or done step.
  protected readonly entry = injectDraftEntry(
    (name) => this.store.openDraft(name),
    () => undefined,
  );
  protected readonly gate = computed(() => draftGateText(this.i18n.tr(), this.entry.phase()));

  constructor() {
    if (this.entry.phase() === 'ready') {
      // Read from the snapshot: the steps below need the invoice before this component's inputs are set.
      const invoice = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
      this.store.resume(invoice);
    }
  }
}

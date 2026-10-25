import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { injectPrefillEntry } from '../../../core/tasks/prefill-entry';
import { DraftGateComponent } from '../../../shared/ui/draft-gate.component';
import { TransferStore } from '../data-access/transfer.store';

/**
 * Hosts the "Move stock" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 * `?prefill=<id>` opens a proposal from the assistant.
 */
@Component({
  selector: 'app-transfer-flow',
  imports: [DraftGateComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (proposal.phase() === 'ready') {
      <router-outlet />
    } @else {
      <app-draft-gate
        [failed]="false"
        [desktop]="desktop()"
        [loading]="loading()"
        title=""
        message=""
        backLabel=""
      />
    }
  `,
})
export class TransferFlowContainer {
  private readonly store = inject(TransferStore);
  private readonly i18n = injectI18n();
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly loading = computed(() => this.i18n.tr().t('prefill.loading'));
  protected readonly proposal = injectPrefillEntry(
    'stock_move',
    (payload) => this.store.openPrefill(payload),
    (notice) => this.store.prefillFailed(notice),
  );

  constructor() {
    this.store.resume();
  }
}

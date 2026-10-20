import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CanDeactivateFn, Router, RouterOutlet } from '@angular/router';
import { injectI18n } from '../../../core/i18n/i18n';
import { draftGateText, injectDraftEntry } from '../../../core/tasks/draft-entry';
import { ViewportService } from '../../../core/layout/viewport.service';
import { DraftGateComponent } from '../../../shared/ui/draft-gate.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { QuickSaleStore } from '../data-access/quick-sale.store';

/** Hosts the quick-sale steps and asks before an edited sale is left (save draft, discard, or stay). */
@Component({
  selector: 'app-sale-flow',
  imports: [ConfirmDialogComponent, DraftGateComponent, RouterOutlet],
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
    <app-confirm-dialog
      [open]="asking()"
      [title]="text().title"
      [message]="text().message"
      [actions]="text().actions"
      (chosen)="answer($event)"
    />
  `,
})
export class SaleFlowContainer {
  private readonly store = inject(QuickSaleStore);
  private readonly i18n = injectI18n();
  protected readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  /** `?draft=<invoice>` continues a saved sale; a sale already in progress under another name is replaced. */
  protected readonly entry = injectDraftEntry(
    (name) => this.store.openDraft(name),
    () =>
      void this.router.navigate([
        '/sales/new',
        this.store.state() === 'confirming' ? 'review' : 'checking',
      ]),
  );
  protected readonly asking = signal(false);
  private resolveLeave?: (leave: boolean) => void;

  protected readonly gate = computed(() => draftGateText(this.i18n.tr(), this.entry.phase()));

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      title: t('sale.unsaved.title'),
      message: t('sale.unsaved.message'),
      actions: [
        { id: 'save', label: t('sale.unsaved.save'), primary: true },
        { id: 'discard', label: t('sale.unsaved.discard') },
        { id: 'stay', label: t('sale.unsaved.stay') },
      ],
    };
  });

  confirmLeave(): Promise<boolean> {
    if (!this.store.dirty()) {
      return Promise.resolve(true);
    }
    this.asking.set(true);
    return new Promise((resolve) => (this.resolveLeave = resolve));
  }

  protected async answer(choice: string): Promise<void> {
    if (choice === 'save') {
      try {
        await this.store.saveDraft();
      } catch {
        this.close(false);
        return;
      }
    }
    if (choice === 'save' || choice === 'discard') {
      this.store.start();
      this.close(true);
      return;
    }
    this.close(false);
  }

  private close(leave: boolean): void {
    this.asking.set(false);
    this.resolveLeave?.(leave);
    this.resolveLeave = undefined;
  }
}

export const saleLeaveGuard: CanDeactivateFn<SaleFlowContainer> = (flow) => flow.confirmLeave();

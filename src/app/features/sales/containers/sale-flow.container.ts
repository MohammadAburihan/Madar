import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CanDeactivateFn, RouterOutlet } from '@angular/router';
import { injectI18n } from '../../../core/i18n/i18n';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { QuickSaleStore } from '../data-access/quick-sale.store';

/** Hosts the quick-sale steps and asks before an edited sale is left (save draft, discard, or stay). */
@Component({
  selector: 'app-sale-flow',
  imports: [ConfirmDialogComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
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
  protected readonly asking = signal(false);
  private resolveLeave?: (leave: boolean) => void;

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

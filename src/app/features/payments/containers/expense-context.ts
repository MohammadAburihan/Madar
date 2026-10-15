import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { ExpenseStore } from '../data-access/expense.store';
import { ExpenseSummary } from './expense-view';

/** What every "Record expense" container needs: the expense, the user, language and layout. */
export function injectExpenseContext() {
  const store = inject(ExpenseStore);
  const session = inject(SessionService);
  const business = inject(BusinessService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  return {
    store,
    session,
    router,
    i18n,
    desktop: computed(() => viewport() !== 'mobile'),
    currency: computed(() => business.active()?.currency ?? ''),
    /** What the expense comes to, in words the review and recorded steps show. */
    summary: computed((): ExpenseSummary | null => {
      const category = store.chosenCategory();
      const account = store.chosenAccount();
      return category && account
        ? {
            category: category.name,
            amount: store.amount(),
            date: store.date(),
            account: account.label,
            project: store.chosenProject()?.name ?? null,
            hasReceipt: !!store.receipt(),
          }
        : null;
    }),
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/money/expense', ...path.split('/').filter(Boolean)], extras),
  };
}

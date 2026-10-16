import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth/auth.guards';
import { inventoryRoutes } from './features/inventory/inventory.routes';
import { paymentRoutes } from './features/payments/payment.routes';
import { projectRoutes } from './features/projects/projects.routes';
import { purchaseRoutes } from './features/purchasing/purchase.routes';
import { reportRoutes } from './features/reports/reports.routes';
import {
  invoiceRoute,
  quotationRoutes,
  saleRoutes,
  salesRecordsRoute,
} from './features/sales/sale.routes';

const placeholder = (path: string, titleKey: string) => ({
  path,
  data: { titleKey },
  loadComponent: () =>
    import('./features/shell/containers/placeholder.container').then((m) => m.PlaceholderContainer),
});

export const routes: Routes = [
  {
    path: 'sign-in',
    canMatch: [signedOutGuard],
    loadComponent: () =>
      import('./features/auth/containers/sign-in.container').then((m) => m.SignInContainer),
  },
  {
    path: '',
    canMatch: [signedInGuard],
    loadComponent: () =>
      import('./features/shell/containers/shell.container').then((m) => m.ShellContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/containers/home.container').then((m) => m.HomeContainer),
      },
      saleRoutes,
      invoiceRoute,
      salesRecordsRoute,
      ...quotationRoutes,
      ...paymentRoutes,
      ...inventoryRoutes,
      ...purchaseRoutes,
      ...projectRoutes,
      ...reportRoutes,
      placeholder('contacts', 'nav.contacts'),
      placeholder('settings', 'nav.settings'),
      {
        path: 'more',
        loadComponent: () =>
          import('./features/shell/containers/more.container').then((m) => m.MoreContainer),
      },
      placeholder('new', 'nav.new'),
      placeholder('drafts', 'nav.drafts'),
      placeholder('businesses', 'nav.activeBusiness'),
      {
        path: 'task/:action',
        loadComponent: () =>
          import('./features/shell/containers/placeholder.container').then(
            (m) => m.PlaceholderContainer,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

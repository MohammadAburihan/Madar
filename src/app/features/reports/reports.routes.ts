import { Route } from '@angular/router';

export const reportRoutes: Route[] = [
  {
    path: 'reports',
    pathMatch: 'full',
    loadComponent: () => import('./containers/reports.container').then((m) => m.ReportsContainer),
  },
  {
    path: 'reports/profit',
    loadComponent: () =>
      import('./containers/profit-months.container').then((m) => m.ProfitMonthsContainer),
  },
  {
    path: 'reports/customer',
    data: { kind: 'customer' },
    loadComponent: () =>
      import('./containers/statement.container').then((m) => m.StatementContainer),
  },
  {
    path: 'reports/supplier',
    data: { kind: 'supplier' },
    loadComponent: () =>
      import('./containers/statement.container').then((m) => m.StatementContainer),
  },
];

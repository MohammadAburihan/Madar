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
];

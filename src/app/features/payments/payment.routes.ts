import { Route } from '@angular/router';

export const paymentRoutes: Route[] = [
  {
    path: 'money',
    pathMatch: 'full',
    loadComponent: () => import('./containers/money.container').then((m) => m.MoneyContainer),
  },
  {
    path: 'money/receive',
    loadComponent: () =>
      import('./containers/collect-flow.container').then((m) => m.CollectFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/collect-choose.container').then((m) => m.CollectChooseContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/collect-review.container').then((m) => m.CollectReviewContainer),
      },
      {
        path: 'recorded',
        loadComponent: () =>
          import('./containers/collect-recorded.container').then((m) => m.CollectRecordedContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/collect-checking.container').then((m) => m.CollectCheckingContainer),
      },
    ],
  },
];

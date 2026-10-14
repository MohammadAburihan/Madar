import { Route } from '@angular/router';

export const purchaseRoutes: Route[] = [
  {
    path: 'purchases',
    pathMatch: 'full',
    loadComponent: () =>
      import('./containers/purchasing.container').then((m) => m.PurchasingContainer),
  },
  {
    path: 'purchases/new',
    loadComponent: () =>
      import('./containers/purchase-flow.container').then((m) => m.PurchaseFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/purchase-form.container').then((m) => m.PurchaseFormContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/purchase-review.container').then((m) => m.PurchaseReviewContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/purchase-checking.container').then(
            (m) => m.PurchaseCheckingContainer,
          ),
      },
    ],
  },
  {
    path: 'purchases/order/:name',
    loadComponent: () =>
      import('./containers/purchase-order.container').then((m) => m.PurchaseOrderContainer),
  },
];

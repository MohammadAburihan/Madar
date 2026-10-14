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
    path: 'purchases/order/:name/receive',
    loadComponent: () =>
      import('./containers/receipt-flow.container').then((m) => m.ReceiptFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/receipt-form.container').then((m) => m.ReceiptFormContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/receipt-checking.container').then((m) => m.ReceiptCheckingContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/receipt-done.container').then((m) => m.ReceiptDoneContainer),
      },
    ],
  },
  {
    path: 'purchases/order/:name',
    loadComponent: () =>
      import('./containers/purchase-order.container').then((m) => m.PurchaseOrderContainer),
  },
];

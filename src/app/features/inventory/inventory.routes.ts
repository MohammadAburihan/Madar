import { Route } from '@angular/router';

export const inventoryRoutes: Route[] = [
  {
    path: 'inventory',
    pathMatch: 'full',
    loadComponent: () =>
      import('./containers/inventory.container').then((m) => m.InventoryContainer),
  },
  {
    path: 'inventory/transfer',
    loadComponent: () =>
      import('./containers/transfer-flow.container').then((m) => m.TransferFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/transfer-move.container').then((m) => m.TransferMoveContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/transfer-review.container').then((m) => m.TransferReviewContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/transfer-done.container').then((m) => m.TransferDoneContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/transfer-checking.container').then(
            (m) => m.TransferCheckingContainer,
          ),
      },
    ],
  },
];

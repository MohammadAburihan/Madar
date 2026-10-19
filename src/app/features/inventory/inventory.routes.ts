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
  {
    path: 'inventory/count',
    data: { kind: 'count' },
    loadComponent: () =>
      import('./containers/adjust-flow.container').then((m) => m.AdjustFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/adjust-entry.container').then((m) => m.AdjustEntryContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/adjust-review.container').then((m) => m.AdjustReviewContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/adjust-done.container').then((m) => m.AdjustDoneContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/adjust-checking.container').then((m) => m.AdjustCheckingContainer),
      },
    ],
  },
  {
    path: 'inventory/damage',
    data: { kind: 'damage' },
    loadComponent: () =>
      import('./containers/adjust-flow.container').then((m) => m.AdjustFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/adjust-entry.container').then((m) => m.AdjustEntryContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/adjust-review.container').then((m) => m.AdjustReviewContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/adjust-done.container').then((m) => m.AdjustDoneContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/adjust-checking.container').then((m) => m.AdjustCheckingContainer),
      },
    ],
  },
  {
    path: 'inventory/add',
    loadComponent: () =>
      import('./containers/add-stock-flow.container').then((m) => m.AddStockFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/add-stock-entry.container').then((m) => m.AddStockEntryContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/add-stock-review.container').then((m) => m.AddStockReviewContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/add-stock-done.container').then((m) => m.AddStockDoneContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/add-stock-checking.container').then(
            (m) => m.AddStockCheckingContainer,
          ),
      },
    ],
  },
];

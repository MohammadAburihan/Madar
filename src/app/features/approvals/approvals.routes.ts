import { Route } from '@angular/router';

export const approvalRoutes: Route[] = [
  {
    path: 'approvals',
    pathMatch: 'full',
    loadComponent: () =>
      import('./containers/approvals.container').then((m) => m.ApprovalsContainer),
  },
  {
    path: 'approvals/:doctype/:name',
    loadComponent: () => import('./containers/approval.container').then((m) => m.ApprovalContainer),
  },
];

import { Route } from '@angular/router';

export const workerRoutes: Route[] = [
  {
    path: 'workers',
    pathMatch: 'full',
    loadComponent: () => import('./containers/workers.container').then((m) => m.WorkersContainer),
  },
  {
    path: 'workers/attendance',
    loadComponent: () =>
      import('./containers/attendance.container').then((m) => m.AttendanceContainer),
  },
  {
    path: 'workers/leave',
    pathMatch: 'full',
    loadComponent: () =>
      import('./containers/leave-requests.container').then((m) => m.LeaveRequestsContainer),
  },
  {
    path: 'workers/leave/new',
    loadComponent: () =>
      import('./containers/leave-form.container').then((m) => m.LeaveFormContainer),
  },
  {
    path: 'workers/leave/:id',
    loadComponent: () =>
      import('./containers/leave-request.container').then((m) => m.LeaveRequestContainer),
  },
  {
    path: 'workers/advance/new',
    loadComponent: () =>
      import('./containers/advance-form.container').then((m) => m.AdvanceFormContainer),
  },
  {
    path: 'workers/shift/new',
    loadComponent: () =>
      import('./containers/shift-form.container').then((m) => m.ShiftFormContainer),
  },
  {
    path: 'workers/new',
    loadComponent: () =>
      import('./containers/worker-form.container').then((m) => m.WorkerFormContainer),
  },
  {
    path: 'workers/:id/edit',
    loadComponent: () =>
      import('./containers/worker-form.container').then((m) => m.WorkerFormContainer),
  },
  {
    path: 'workers/:id',
    loadComponent: () => import('./containers/worker.container').then((m) => m.WorkerContainer),
  },
];

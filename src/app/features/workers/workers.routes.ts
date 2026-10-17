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

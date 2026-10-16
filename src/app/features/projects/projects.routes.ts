import { Route } from '@angular/router';

export const projectRoutes: Route[] = [
  {
    path: 'projects',
    pathMatch: 'full',
    loadComponent: () => import('./containers/projects.container').then((m) => m.ProjectsContainer),
  },
  {
    path: 'projects/new',
    loadComponent: () =>
      import('./containers/project-form.container').then((m) => m.ProjectFormContainer),
  },
  {
    path: 'projects/:name/edit',
    loadComponent: () =>
      import('./containers/project-form.container').then((m) => m.ProjectFormContainer),
  },
  {
    path: 'projects/:name/saved',
    loadComponent: () =>
      import('./containers/project-saved.container').then((m) => m.ProjectSavedContainer),
  },
  {
    path: 'projects/:name/requirement',
    loadComponent: () =>
      import('./containers/requirement.container').then((m) => m.RequirementContainer),
  },
  {
    path: 'projects/:name/supply/:item',
    loadComponent: () =>
      import('./containers/supply-flow.container').then((m) => m.SupplyFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/supply-plan.container').then((m) => m.SupplyPlanContainer),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./containers/supply-review.container').then((m) => m.SupplyReviewContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/supply-checking.container').then((m) => m.SupplyCheckingContainer),
      },
      {
        path: 'done',
        loadComponent: () =>
          import('./containers/supply-done.container').then((m) => m.SupplyDoneContainer),
      },
    ],
  },
  {
    path: 'projects/:name',
    loadComponent: () => import('./containers/project.container').then((m) => m.ProjectContainer),
  },
];

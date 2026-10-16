import { Route } from '@angular/router';

export const settingsRoutes: Route[] = [
  {
    path: 'settings',
    loadComponent: () => import('./containers/settings.container').then((m) => m.SettingsContainer),
  },
  {
    path: 'businesses',
    loadComponent: () =>
      import('./containers/businesses.container').then((m) => m.BusinessesContainer),
  },
];

import { Route } from '@angular/router';

export const settingsRoutes: Route[] = [
  {
    path: 'settings',
    loadComponent: () => import('./containers/settings.container').then((m) => m.SettingsContainer),
  },
];

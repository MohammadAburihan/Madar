import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/containers/home.container').then((m) => m.HomeContainer),
  },
  { path: '**', redirectTo: '' },
];

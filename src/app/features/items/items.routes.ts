import { Route } from '@angular/router';

export const itemRoutes: Route[] = [
  {
    path: 'catalog',
    pathMatch: 'full',
    loadComponent: () => import('./containers/catalog.container').then((m) => m.CatalogContainer),
  },
  {
    path: 'catalog/new',
    loadComponent: () =>
      import('./containers/item-form.container').then((m) => m.ItemFormContainer),
  },
  {
    path: 'catalog/:code/edit',
    loadComponent: () =>
      import('./containers/item-form.container').then((m) => m.ItemFormContainer),
  },
  {
    path: 'catalog/:code',
    loadComponent: () => import('./containers/item.container').then((m) => m.ItemContainer),
  },
];

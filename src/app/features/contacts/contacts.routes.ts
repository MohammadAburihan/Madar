import { Route } from '@angular/router';

export const contactRoutes: Route[] = [
  {
    path: 'contacts',
    pathMatch: 'full',
    loadComponent: () => import('./containers/contacts.container').then((m) => m.ContactsContainer),
  },
  {
    path: 'contacts/:kind/:id',
    loadComponent: () => import('./containers/contact.container').then((m) => m.ContactContainer),
  },
];

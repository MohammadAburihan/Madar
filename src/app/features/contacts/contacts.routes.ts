import { Route } from '@angular/router';

export const contactRoutes: Route[] = [
  {
    path: 'contacts',
    pathMatch: 'full',
    loadComponent: () => import('./containers/contacts.container').then((m) => m.ContactsContainer),
  },
  {
    path: 'contacts/new',
    loadComponent: () =>
      import('./containers/contact-form.container').then((m) => m.ContactFormContainer),
  },
  {
    path: 'contacts/:kind/:id/edit',
    loadComponent: () =>
      import('./containers/contact-form.container').then((m) => m.ContactFormContainer),
  },
  {
    path: 'contacts/:kind/:id/history',
    loadComponent: () =>
      import('./containers/contact-history.container').then((m) => m.ContactHistoryContainer),
  },
  {
    path: 'contacts/:kind/:id',
    loadComponent: () => import('./containers/contact.container').then((m) => m.ContactContainer),
  },
];

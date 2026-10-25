import { Route } from '@angular/router';

export const assistantRoutes: Route[] = [
  {
    path: 'assistant',
    loadComponent: () =>
      import('./containers/assistant.container').then((m) => m.AssistantContainer),
  },
];

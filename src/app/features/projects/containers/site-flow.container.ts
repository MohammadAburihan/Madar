import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { SiteStore } from '../data-access/site.store';

/**
 * Hosts the "Materials at site" steps. It is created only when the task is entered from elsewhere, so that is
 * where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-site-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class SiteFlowContainer {
  constructor() {
    // Read from the snapshot: the steps below need the project and item before this component's inputs are set.
    const params = inject(ActivatedRoute).snapshot.paramMap;
    inject(SiteStore).resume(params.get('name') ?? '', params.get('item') ?? '');
  }
}

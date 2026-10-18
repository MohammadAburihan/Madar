import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { CountStore, DamageStore } from '../data-access/adjust.store';
import { routeKind } from './adjust-context';

/**
 * Hosts the "Count stock" or "Damage or loss" steps. It is created only when the task is entered from elsewhere, so
 * that is where a fresh visit starts over; moving between steps (including the back button) keeps the work.
 */
@Component({
  selector: 'app-adjust-flow',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class AdjustFlowContainer {
  constructor() {
    const kind = routeKind(inject(ActivatedRoute));
    (kind === 'count' ? inject(CountStore) : inject(DamageStore)).resume();
  }
}

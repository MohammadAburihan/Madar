import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular';
import { TranslocoPipe } from '@jsverse/transloco';

export interface QuickAction {
  id: string;
  icon: string;
}

@Component({
  selector: 'app-quick-actions',
  imports: [IonIcon, IonRippleEffect, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grid">
      @for (action of actions(); track action.id) {
        <li>
          <button
            type="button"
            class="action ion-activatable"
            (click)="actionSelected.emit(action.id)"
          >
            <ion-icon [name]="action.icon" aria-hidden="true" />
            <span>{{ 'home.actions.' + action.id | transloco }}</span>
            <ion-ripple-effect />
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .action {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: 6rem;
      padding: 1rem 0.5rem;
      border: 1px solid var(--ion-color-step-150, #e4e1dc);
      border-radius: 0.75rem;
      background: var(--ion-item-background, #fff);
      color: var(--ion-text-color);
      font: inherit;
      cursor: pointer;
    }

    .action:focus-visible {
      outline: 2px solid var(--ion-color-primary);
      outline-offset: 2px;
    }

    ion-icon {
      font-size: 1.75rem;
      color: var(--ion-color-primary);
    }
  `,
})
export class QuickActionsComponent {
  readonly actions = input.required<readonly QuickAction[]>();
  readonly actionSelected = output<string>();
}

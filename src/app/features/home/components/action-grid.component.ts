import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ActionView } from '../containers/home-view';

@Component({
  selector: 'app-action-grid',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--columns]': 'columns()' },
  template: `
    @for (action of actions(); track action.id; let last = $last) {
      <button
        type="button"
        class="md-btn"
        [class.span-all]="last && lastSpans()"
        (click)="actionSelected.emit(action.id)"
      >
        <svg [lucideIcon]="action.icon" [size]="20" aria-hidden="true"></svg>
        <span>{{ action.label }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: var(--row-gap, 12px) 12px;
    }

    button {
      gap: 8px;
    }

    svg {
      flex: none;
    }

    .span-all {
      grid-column: 1 / -1;
    }
  `,
})
export class ActionGridComponent {
  readonly actions = input.required<readonly ActionView[]>();
  readonly columns = input<number>(2);
  readonly actionSelected = output<string>();

  protected readonly lastSpans = computed(() => this.actions().length % this.columns() === 1);
}

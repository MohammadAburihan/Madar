import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ActionView } from '../containers/home-view';

@Component({
  selector: 'app-action-grid',
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
        {{ action.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: var(--row-gap, 12px) 12px;
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

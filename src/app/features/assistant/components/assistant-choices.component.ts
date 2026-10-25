import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChoiceView } from '../containers/assistant-view';

/** The matches a name had: pressing one answers the assistant's question with that match's label. */
@Component({
  selector: 'app-assistant-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-label]="label()">
      @for (option of options(); track option.id) {
        <button type="button" class="md-btn" (click)="picked.emit(option.label)">
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    div {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .md-btn {
      inline-size: auto;
      min-block-size: 40px;
      padding-block: 7px;
      font-size: 14px;
    }
  `,
})
export class AssistantChoicesComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly ChoiceView[]>();
  readonly picked = output<string>();
}

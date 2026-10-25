import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The questions offered on an empty conversation; choosing one sends its text. */
@Component({
  selector: 'app-assistant-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-label]="label()">
      @for (suggestion of suggestions(); track $index) {
        <button type="button" class="md-btn" (click)="picked.emit(suggestion)">
          {{ suggestion }}
        </button>
      }
    </div>
  `,
  styles: `
    div {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
})
export class AssistantSuggestionsComponent {
  readonly label = input.required<string>();
  readonly suggestions = input.required<readonly string[]>();
  readonly picked = output<string>();
}

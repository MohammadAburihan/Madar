import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { TextAreaFieldComponent } from '../../../shared/ui/text-area-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';

export interface OpeningFormText {
  intro: string;
  amount: string;
  amountError: string;
  date: string;
  dateHint: string;
  dateError: string;
  note: string;
  review: string;
}

/** Step 1 of an opening balance: the amount, the date it was first owed and an optional note. */
@Component({
  selector: 'app-opening-balance-form',
  imports: [TextAreaFieldComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="muted intro">{{ text().intro }}</p>
    <app-text-field
      [label]="text().amount"
      inputmode="decimal"
      [ltr]="true"
      [suffix]="currency()"
      [readonly]="locked()"
      [error]="showErrors() && !amountValid() ? text().amountError : null"
      [value]="amount()"
      (valueChange)="amount.set($event)"
    />
    <app-text-field
      [label]="text().date"
      type="date"
      [readonly]="locked()"
      [hint]="text().dateHint"
      [error]="showErrors() && !dateValid() ? text().dateError : null"
      [value]="date()"
      (valueChange)="date.set($event)"
    />
    <app-text-area-field
      [label]="text().note"
      [readonly]="locked()"
      [value]="note()"
      (valueChange)="note.set($event)"
    />
    <button type="button" class="md-btn md-btn--primary" (click)="review.emit()">
      {{ text().review }}
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }

    .intro {
      margin: 0;
    }
  `,
})
export class OpeningBalanceFormComponent {
  readonly text = input.required<OpeningFormText>();
  readonly currency = input.required<string>();
  readonly amount = model('');
  readonly date = model('');
  readonly note = model('');
  readonly amountValid = input(true);
  readonly dateValid = input(true);
  /** Show what is wrong with the fields, after Review was tapped once. */
  readonly showErrors = input(false);
  readonly locked = input(false);
  readonly review = output<void>();
}

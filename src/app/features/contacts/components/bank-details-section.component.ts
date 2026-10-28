import { ChangeDetectionStrategy, Component, input, model, output, signal } from '@angular/core';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';

export interface BankSuggestionView {
  value: string;
  label: string;
  add: boolean;
}

export interface BankSectionText {
  heading: string;
  bank: string;
  bankPlaceholder: string;
  iban: string;
  accountNo: string;
}

/** The optional bank block of the contact form: a bank to type or pick, the IBAN and the account number. */
@Component({
  selector: 'app-bank-details-section',
  imports: [TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section" [attr.aria-label]="text().heading">
      <h2 class="heading">{{ text().heading }}</h2>
      <div class="field" [class.invalid]="!!bankError()">
        <label class="label" for="bank-input">{{ text().bank }}</label>
        <input
          id="bank-input"
          class="control"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          [attr.aria-expanded]="open() && suggestions().length > 0"
          aria-controls="bank-options"
          [attr.aria-invalid]="bankError() ? true : null"
          [placeholder]="text().bankPlaceholder"
          [readOnly]="readonly()"
          [value]="bank()"
          (input)="bank.set($any($event.target).value); open.set(true)"
          (focus)="open.set(true)"
          (blur)="open.set(false)"
        />
        @if (open() && suggestions().length) {
          <ul id="bank-options" class="options" role="listbox">
            @for (s of suggestions(); track s.value + s.add) {
              <li role="option" [attr.aria-selected]="false">
                <button
                  type="button"
                  class="option"
                  [class.add]="s.add"
                  (mousedown)="$event.preventDefault()"
                  (click)="choose(s)"
                >
                  {{ s.label }}
                </button>
              </li>
            }
          </ul>
        }
        @if (bankError()) {
          <span class="error" role="alert">{{ bankError() }}</span>
        }
      </div>
      <app-text-field
        [label]="text().iban"
        [ltr]="true"
        autocomplete="off"
        [readonly]="readonly()"
        [error]="ibanError()"
        [value]="iban()"
        (valueChange)="iban.set($event)"
      />
      <app-text-field
        [label]="text().accountNo"
        [ltr]="true"
        inputmode="text"
        autocomplete="off"
        [readonly]="readonly()"
        [error]="accountNoError()"
        [value]="accountNo()"
        (valueChange)="accountNo.set($event)"
      />
    </section>
  `,
  styles: `
    .section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .heading {
      margin: 0;
      color: var(--md-ink);
      font: 600 18px / var(--md-lh) var(--md-font);
    }

    .field {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .label {
      color: var(--md-muted);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .control {
      box-sizing: border-box;
      block-size: 48px;
      padding-inline: 12px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
    }

    .control:focus {
      outline: 3px solid var(--md-primary);
      outline-offset: 2px;
    }

    .invalid .control {
      border-color: var(--md-danger);
    }

    .options {
      margin: 0;
      padding: 4px;
      list-style: none;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
    }

    .option {
      all: unset;
      box-sizing: border-box;
      display: block;
      inline-size: 100%;
      padding: 12px;
      border-radius: 6px;
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      cursor: pointer;
    }

    .option:hover,
    .option:focus-visible {
      background: var(--md-tint);
    }

    .option.add {
      color: var(--md-primary);
      font-weight: 600;
    }

    .error {
      color: var(--md-danger);
      font: 400 15px / var(--md-lh) var(--md-font);
    }
  `,
})
export class BankDetailsSectionComponent {
  readonly text = input.required<BankSectionText>();
  readonly bank = model('');
  readonly iban = model('');
  readonly accountNo = model('');
  readonly suggestions = input<readonly BankSuggestionView[]>([]);
  readonly bankError = input<string | null>(null);
  readonly ibanError = input<string | null>(null);
  readonly accountNoError = input<string | null>(null);
  readonly readonly = input(false);
  /** A suggestion was chosen: an existing bank, or "Add bank" for a new one. */
  readonly pick = output<BankSuggestionView>();

  protected readonly open = signal(false);

  protected choose(suggestion: BankSuggestionView): void {
    this.bank.set(suggestion.value);
    this.open.set(false);
    this.pick.emit(suggestion);
  }
}

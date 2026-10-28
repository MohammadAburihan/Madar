import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
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
      <div class="field" [class.invalid]="!!bankError()" (focusout)="leave($event)">
        <label class="label" for="bank-input">{{ text().bank }}</label>
        <input
          id="bank-input"
          class="control"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          [attr.aria-expanded]="expanded()"
          aria-controls="bank-options"
          [attr.aria-activedescendant]="
            expanded() && active() >= 0 ? 'bank-option-' + active() : null
          "
          [attr.aria-invalid]="bankError() ? true : null"
          [placeholder]="text().bankPlaceholder"
          [readOnly]="readonly()"
          [value]="bank()"
          (input)="bank.set($any($event.target).value); open.set(true); active.set(-1)"
          (focus)="open.set(true)"
          (keydown)="keydown($event)"
        />
        @if (expanded()) {
          <ul id="bank-options" class="options" role="listbox" [attr.aria-label]="text().bank">
            @for (s of suggestions(); track s.value + s.add; let i = $index) {
              <li
                role="option"
                class="option"
                [id]="'bank-option-' + i"
                [class.add]="s.add"
                [class.active]="i === active()"
                [attr.aria-selected]="i === active()"
                (mousedown)="$event.preventDefault()"
                (click)="choose(s)"
              >
                {{ s.label }}
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
        [error]="submitted() || ibanTouched() ? ibanError() : null"
        (focusout)="ibanTouched.set(true)"
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
      box-sizing: border-box;
      display: block;
      inline-size: 100%;
      padding: 12px;
      border-radius: 6px;
      color: var(--md-ink);
      font: 400 16px / var(--md-lh) var(--md-font);
      cursor: pointer;
      list-style: none;
    }

    .option:hover,
    .option.active {
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
  /** A save was attempted: the IBAN error shows before the field has been left. */
  readonly submitted = input(false);
  /** A suggestion was chosen: an existing bank, or "Add bank" for a new one. */
  readonly pick = output<BankSuggestionView>();

  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly ibanTouched = signal(false);
  protected readonly expanded = computed(() => this.open() && this.suggestions().length > 0);

  protected keydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!count) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const from = this.expanded() ? this.active() : -1;
      this.open.set(true);
      this.active.set(from < 0 ? (step > 0 ? 0 : count - 1) : (from + step + count) % count);
    } else if (event.key === 'Enter' && this.expanded() && this.active() >= 0) {
      event.preventDefault();
      this.choose(this.suggestions()[this.active()]);
    } else if (event.key === 'Escape' && this.expanded()) {
      event.preventDefault();
      event.stopPropagation();
      this.open.set(false);
    }
  }

  protected leave(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
      this.open.set(false);
    }
  }

  protected choose(suggestion: BankSuggestionView): void {
    this.bank.set(suggestion.value);
    this.open.set(false);
    this.active.set(-1);
    this.pick.emit(suggestion);
  }
}

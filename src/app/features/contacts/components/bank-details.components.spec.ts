import { TestBed } from '@angular/core/testing';
import { BankDetailsCardComponent } from './bank-details-card.component';
import { BankDetailsSectionComponent } from './bank-details-section.component';

const TEXT = {
  heading: 'Bank details (optional)',
  bank: 'Bank',
  bankPlaceholder: 'Search or type a bank',
  iban: 'IBAN',
  accountNo: 'Account number',
};
const SUGGESTIONS = [
  { value: 'Arab Bank', label: 'Arab Bank', add: false },
  { value: 'Arab Zed', label: 'Add bank “Arab Zed”', add: true },
];

async function section(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(BankDetailsSectionComponent);
  const base = { text: TEXT, ...inputs };
  for (const [key, value] of Object.entries(base)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}
const root = (f: { nativeElement: HTMLElement }) => f.nativeElement;
const bankInput = (f: { nativeElement: HTMLElement }) =>
  root(f).querySelector('#bank-input') as HTMLInputElement;

describe('BankDetailsSectionComponent', () => {
  it('shows the heading, the bank field and left-to-right IBAN and number fields', async () => {
    const f = await section();
    expect(root(f).querySelector('h2')?.textContent).toBe('Bank details (optional)');
    expect(bankInput(f).placeholder).toBe('Search or type a bank');
    const inputs = [...root(f).querySelectorAll('app-text-field input')];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.getAttribute('dir'))).toEqual(['ltr', 'ltr']);
    expect(root(f).textContent).toContain('IBAN');
    expect(root(f).textContent).toContain('Account number');
  });

  it('lists suggestions while typing and emits the one chosen, filling the field', async () => {
    const f = await section({ suggestions: SUGGESTIONS });
    const picked = vi.fn();
    f.componentInstance.pick.subscribe(picked);
    bankInput(f).dispatchEvent(new Event('focus'));
    await f.whenStable();
    const options = [...root(f).querySelectorAll('button.option')] as HTMLButtonElement[];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Arab Bank', 'Add bank “Arab Zed”']);
    options[1].click();
    await f.whenStable();
    expect(picked).toHaveBeenCalledWith(SUGGESTIONS[1]);
    expect(f.componentInstance.bank()).toBe('Arab Zed');
    expect(root(f).querySelector('button.option')).toBeNull();
  });

  it('passes typed text to the model', async () => {
    const f = await section();
    bankInput(f).value = 'Cairo';
    bankInput(f).dispatchEvent(new Event('input'));
    const [iban, account] = [
      ...root(f).querySelectorAll('app-text-field input'),
    ] as HTMLInputElement[];
    iban.value = 'JO94';
    iban.dispatchEvent(new Event('input'));
    account.value = '12-3';
    account.dispatchEvent(new Event('input'));
    expect([
      f.componentInstance.bank(),
      f.componentInstance.iban(),
      f.componentInstance.accountNo(),
    ]).toEqual(['Cairo', 'JO94', '12-3']);
  });

  it('shows the errors it is given', async () => {
    const f = await section({
      bankError: 'Choose the bank these numbers belong to.',
      ibanError: 'Enter a valid IBAN.',
      accountNoError: 'Use letters, digits and dashes only.',
    });
    const alerts = [...root(f).querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
    expect(alerts).toEqual([
      'Choose the bank these numbers belong to.',
      'Enter a valid IBAN.',
      'Use letters, digits and dashes only.',
    ]);
    expect(bankInput(f).getAttribute('aria-invalid')).toBe('true');
  });

  it('can be read only', async () => {
    const f = await section({ readonly: true });
    expect(bankInput(f).readOnly).toBe(true);
  });
});

describe('BankDetailsCardComponent', () => {
  it('shows each row, the IBAN and number left to right', async () => {
    const fixture = TestBed.createComponent(BankDetailsCardComponent);
    fixture.componentRef.setInput('title', 'Bank details');
    fixture.componentRef.setInput('rows', [
      { label: 'Bank', value: 'Arab Bank', ltr: false },
      { label: 'IBAN', value: 'JO94CBJO0010000000000131000302', ltr: true },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toBe('Bank details');
    const values = [...el.querySelectorAll('dd')];
    expect(values.map((d) => d.textContent)).toEqual([
      'Arab Bank',
      'JO94CBJO0010000000000131000302',
    ]);
    expect(values.map((d) => d.getAttribute('dir'))).toEqual([null, 'ltr']);
  });
});

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
    const options = [...root(f).querySelectorAll('[role=option]')] as HTMLElement[];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Arab Bank', 'Add bank “Arab Zed”']);
    options[1].click();
    await f.whenStable();
    expect(picked).toHaveBeenCalledWith(SUGGESTIONS[1]);
    expect(f.componentInstance.bank()).toBe('Arab Zed');
    expect(root(f).querySelector('[role=option]')).toBeNull();
  });

  describe('keyboard', () => {
    const key = (f: { nativeElement: HTMLElement }, name: string) => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      bankInput(f).dispatchEvent(event);
      return event;
    };
    const options = (f: { nativeElement: HTMLElement }) => [
      ...root(f).querySelectorAll('[role=option]'),
    ];

    it('is a combobox whose options follow ArrowDown and ArrowUp', async () => {
      const f = await section({ suggestions: SUGGESTIONS });
      expect(bankInput(f).getAttribute('role')).toBe('combobox');
      expect(bankInput(f).getAttribute('aria-expanded')).toBe('false');
      key(f, 'ArrowDown');
      await f.whenStable();
      expect(bankInput(f).getAttribute('aria-expanded')).toBe('true');
      expect(bankInput(f).getAttribute('aria-controls')).toBe('bank-options');
      expect(options(f).map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
      expect(bankInput(f).getAttribute('aria-activedescendant')).toBe(options(f)[0].id);
      key(f, 'ArrowDown');
      await f.whenStable();
      expect(bankInput(f).getAttribute('aria-activedescendant')).toBe(options(f)[1].id);
      key(f, 'ArrowDown');
      await f.whenStable();
      expect(options(f)[0].getAttribute('aria-selected')).toBe('true');
      key(f, 'ArrowUp');
      await f.whenStable();
      expect(options(f)[1].getAttribute('aria-selected')).toBe('true');
    });

    it('picks the active option with Enter, and ignores Enter with none active', async () => {
      const f = await section({ suggestions: SUGGESTIONS });
      const picked = vi.fn();
      f.componentInstance.pick.subscribe(picked);
      bankInput(f).dispatchEvent(new Event('focus'));
      await f.whenStable();
      expect(key(f, 'Enter').defaultPrevented).toBe(false);
      expect(picked).not.toHaveBeenCalled();
      key(f, 'ArrowDown');
      key(f, 'ArrowDown');
      await f.whenStable();
      expect(key(f, 'Enter').defaultPrevented).toBe(true);
      await f.whenStable();
      expect(picked).toHaveBeenCalledWith(SUGGESTIONS[1]);
      expect(f.componentInstance.bank()).toBe('Arab Zed');
      expect(options(f)).toHaveLength(0);
    });

    it('closes on Escape', async () => {
      const f = await section({ suggestions: SUGGESTIONS });
      key(f, 'ArrowDown');
      await f.whenStable();
      key(f, 'Escape');
      await f.whenStable();
      expect(options(f)).toHaveLength(0);
      expect(bankInput(f).getAttribute('aria-expanded')).toBe('false');
    });

    it('stays open when focus moves inside the field and closes when it leaves', async () => {
      const f = await section({ suggestions: SUGGESTIONS });
      key(f, 'ArrowDown');
      await f.whenStable();
      const field = bankInput(f).parentElement!;
      const inside = options(f)[0] as HTMLElement;
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inside }));
      await f.whenStable();
      expect(options(f)).toHaveLength(2);
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      await f.whenStable();
      expect(options(f)).toHaveLength(0);
    });
  });

  it('shows the IBAN error only after the field is left or a save was tried', async () => {
    const f = await section({ ibanError: 'Enter a valid IBAN.' });
    expect(root(f).textContent).not.toContain('Enter a valid IBAN.');
    const iban = root(f).querySelector('app-text-field input') as HTMLInputElement;
    iban.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await f.whenStable();
    expect(root(f).textContent).toContain('Enter a valid IBAN.');
    const g = await section({ ibanError: 'Enter a valid IBAN.', submitted: true });
    expect(root(g).textContent).toContain('Enter a valid IBAN.');
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
      submitted: true,
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
      {
        label: 'IBAN',
        value: 'JO94CBJO0010000000000131000302',
        ltr: true,
        groups: ['JO94', 'CBJO', '0010', '0000', '0000', '0131', '0003', '02'],
      },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toBe('Bank details');
    const values = [...el.querySelectorAll('dd')];
    expect(values.map((d) => d.textContent?.replace(/\s+/g, ''))).toEqual([
      'ArabBank',
      'JO94CBJO0010000000000131000302',
    ]);
    expect(values.map((d) => d.getAttribute('dir'))).toEqual([null, 'ltr']);
    expect([...values[1].querySelectorAll('.group')].map((g) => g.textContent)).toEqual([
      'JO94',
      'CBJO',
      '0010',
      '0000',
      '0000',
      '0131',
      '0003',
      '02',
    ]);
  });
});

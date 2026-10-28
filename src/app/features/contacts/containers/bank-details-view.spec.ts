import { realTranslator } from '../../../../testing/real-translator';
import {
  bankChanged,
  bankDetailsOf,
  bankErrors,
  bankRows,
  bankSuggestions,
  exactBank,
  resolveBank,
} from './bank-details-view';

const en = realTranslator('en');
const ar = realTranslator('ar');
const BANKS = ['Arab Bank', 'Bank of Palestine', 'Cairo Amman Bank'];
const IBAN = 'JO94CBJO0010000000000131000302';
const visible = (s: string) => s.replace(/[⁨⁩]/g, '');
const NONE = { bank: '', iban: '', accountNo: '' };

describe('bank details view', () => {
  it('matches a bank by its exact name only, ignoring case', () => {
    expect(exactBank(BANKS, ' arab bank ')).toBe('Arab Bank');
    expect(exactBank(BANKS, 'Arab')).toBeNull();
    expect(exactBank(BANKS, '')).toBeNull();
  });

  it('filters the list as the user types, and offers Add bank only to those who may', () => {
    expect(bankSuggestions(BANKS, 'bank', false, en).map((s) => s.value)).toEqual([
      'Arab Bank',
      'Bank of Palestine',
      'Cairo Amman Bank',
    ]);
    expect(bankSuggestions(BANKS, 'cairo', false, en)).toEqual([
      { value: 'Cairo Amman Bank', label: 'Cairo Amman Bank', add: false },
    ]);
    const add = bankSuggestions(BANKS, 'Zed Bank', true, en);
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ value: 'Zed Bank', add: true });
    expect(visible(add[0].label)).toBe('Add bank “Zed Bank”');
    expect(visible(bankSuggestions(BANKS, 'Zed', true, ar)[0].label)).toBe('إضافة البنك «Zed»');
    expect(bankSuggestions(BANKS, 'Zed', false, en)).toEqual([]);
    expect(bankSuggestions(BANKS, 'arab bank', true, en).some((s) => s.add)).toBe(false);
  });

  it('resolves the text to an existing bank, a chosen new one, or nothing yet', () => {
    expect(resolveBank(BANKS, '', null)).toEqual({ kind: 'none' });
    expect(resolveBank(BANKS, 'arab bank', null)).toEqual({ kind: 'existing', name: 'Arab Bank' });
    expect(resolveBank(BANKS, 'Zed', 'Zed')).toEqual({ kind: 'new', name: 'Zed' });
    expect(resolveBank(BANKS, 'Zed2', 'Zed')).toEqual({ kind: 'unpicked', name: 'Zed2' });
    expect(resolveBank(BANKS, 'Arab', null)).toEqual({ kind: 'unpicked', name: 'Arab' });
  });

  it('normalises what is typed into the values ERPNext stores', () => {
    expect(
      bankDetailsOf({ kind: 'existing', name: 'Arab Bank' }, 'jo٩٤ cbjo 0010', ' ١٢-٣ '),
    ).toEqual({ bank: 'Arab Bank', iban: 'JO94CBJO0010', accountNo: '12-3' });
    expect(bankDetailsOf({ kind: 'none' }, '', '')).toEqual(NONE);
  });

  it('requires a bank only when an IBAN or number is given, and explains bad values in both languages', () => {
    const none = { kind: 'none' } as const;
    expect(bankErrors(none, '', '', false, en)).toEqual({
      bank: null,
      iban: null,
      accountNo: null,
    });
    expect(bankErrors(none, IBAN, '', false, en).bank).toBe(
      'Choose the bank these numbers belong to.',
    );
    expect(bankErrors(none, '', '12', false, ar).bank).toBe('اختر البنك الذي تتبع له هذه الأرقام.');
    const unpicked = { kind: 'unpicked', name: 'Zed' } as const;
    expect(bankErrors(unpicked, '', '', false, en).bank).toBe('Choose a bank from the list.');
    expect(bankErrors(unpicked, '', '', true, en).bank).toContain('Add bank');
    expect(bankErrors({ kind: 'new', name: 'Zed' }, IBAN, '1', true, en).bank).toBeNull();
    expect(bankErrors(none, 'JO95CBJO0010000000000131000302', '', false, en).iban).toContain(
      'valid IBAN',
    );
    expect(bankErrors(none, 'bad', '', false, ar).iban).toContain('آيبان');
    expect(bankErrors(none, IBAN, '', false, en).iban).toBeNull();
    expect(bankErrors(none, '', '12/3', false, en).accountNo).toBe(
      'Use letters, digits and dashes only.',
    );
  });

  it('tells a changed form from the account it was loaded from', () => {
    const loaded = {
      name: 'a',
      bank: 'Arab Bank',
      iban: IBAN,
      accountNo: '1-2',
      modified: 'm',
      disabled: false,
    };
    const same = { bank: 'Arab Bank', iban: IBAN, accountNo: '1-2' };
    expect(bankChanged(same, loaded)).toBe(false);
    expect(bankChanged({ ...same, iban: 'GB82WEST12345698765432' }, loaded)).toBe(true);
    expect(bankChanged(NONE, loaded)).toBe(true);
    expect(bankChanged(NONE, null)).toBe(false);
    expect(bankChanged(NONE, { ...loaded, disabled: true })).toBe(false);
    expect(bankChanged(same, { ...loaded, disabled: true })).toBe(true);
  });

  it('lists the detail rows, leaving out empty numbers', () => {
    const record = {
      name: 'a',
      bank: 'Arab Bank',
      iban: IBAN,
      accountNo: '',
      modified: 'm',
      disabled: false,
    };
    expect(bankRows(record, en)).toEqual([
      { label: 'Bank', value: 'Arab Bank', ltr: false },
      { label: 'IBAN', value: IBAN, ltr: true },
    ]);
    expect(bankRows({ ...record, accountNo: '12' }, ar).map((r) => r.label)).toEqual([
      'البنك',
      'رقم الآيبان (IBAN)',
      'رقم الحساب',
    ]);
  });
});

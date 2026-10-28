import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BankChangedError, ContactBankApiService } from '../data-access/contact-bank-api.service';
import { ContactFormApiService } from '../data-access/contact-form-api.service';
import { BankAccountRecord } from '../data-access/contacts.models';
import { ContactFormContainer } from './contact-form.container';

const IBAN = 'JO94CBJO0010000000000131000302';
const BANKS = ['Arab Bank', 'Cairo Amman Bank'];
const ACCOUNT: BankAccountRecord = {
  name: 'Customer Nour - Arab Bank',
  bank: 'Arab Bank',
  iban: IBAN,
  accountNo: '123-456',
  modified: 'm1',
  disabled: false,
};
const forbidden = () => new ErpnextError('forbidden', 'no', 403, null);
const plain = (el: Element | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

interface Options {
  persona?: Persona;
  roles?: string[];
  edit?: boolean;
  account?: BankAccountRecord | null;
  banksError?: unknown;
  accountError?: unknown;
}

async function open(options: Options = {}) {
  const { persona = 'owner', roles, edit, account = null } = options;
  TestBed.resetTestingModule();
  const form = {
    save: vi.fn().mockResolvedValue('Nour'),
    load: vi.fn().mockResolvedValue({ name: 'Nour', phone: '', email: '', address: '' }),
    find: vi.fn(),
  };
  const bank = {
    banks: vi.fn(() =>
      options.banksError ? Promise.reject(options.banksError) : Promise.resolve([...BANKS]),
    ),
    account: vi.fn(() =>
      options.accountError ? Promise.reject(options.accountError) : Promise.resolve(account),
    ),
    save: vi.fn().mockResolvedValue({ ...ACCOUNT, modified: 'm2' }),
  };
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: ContactFormApiService, useValue: form },
      { provide: ContactBankApiService, useValue: bank },
      {
        provide: SessionService,
        useValue: {
          user: signal({ id: 'rehan@rehan.example' }),
          capabilities: () => capabilitiesFor(persona, roles),
          checkExpired: vi.fn(),
        },
      },
      {
        provide: BusinessService,
        useValue: {
          active: signal({ name: 'Rehan Nursery' }),
          ensure: () => Promise.resolve({ country: 'Palestine' }),
        },
      },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ContactFormContainer);
  if (edit) {
    fixture.componentRef.setInput('kind', 'customers');
    fixture.componentRef.setInput('id', 'Nour');
  }
  await fixture.whenStable();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, form, bank, navigate };
}

const fields = (root: HTMLElement) =>
  [...root.querySelectorAll('app-text-field input')] as HTMLInputElement[];
const bankInput = (root: HTMLElement) =>
  root.querySelector('#bank-input') as HTMLInputElement | null;
async function type(
  fixture: { whenStable(): Promise<unknown> },
  el: HTMLInputElement | null,
  value: string,
) {
  el!.value = value;
  el!.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}
const button = (root: HTMLElement, text: RegExp) =>
  [...root.querySelectorAll('button, [role=option]')].find((b) =>
    text.test(plain(b)),
  ) as HTMLButtonElement;
async function press(fixture: { whenStable(): Promise<unknown> }, root: HTMLElement, text: RegExp) {
  button(root, text).click();
  await fixture.whenStable();
}

describe('ContactFormContainer bank details', () => {
  it('shows the bank section to the owner, in the form after the address', async () => {
    const { root } = await open();
    expect(plain(root.querySelector('app-bank-details-section h2'))).toBe(
      'Bank details (optional)',
    );
    expect(fields(root)).toHaveLength(6);
  });

  it('hides it from a salesperson and never reads banks', async () => {
    const { root, bank } = await open({
      persona: 'salesperson',
      roles: ['Sales User', 'Accounts User'],
    });
    expect(root.querySelector('app-bank-details-section')).toBeNull();
    expect(bank.banks).not.toHaveBeenCalled();
  });

  it('saves the contact, then the bank details normalised, then leaves', async () => {
    const { fixture, root, form, bank, navigate } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'arab bank');
    await type(fixture, fields(root)[4], 'jo٩٤ cbjo 0010 0000 0000 0131 0003 02');
    await type(fixture, fields(root)[5], '١٢٣-٤٥٦');
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).toHaveBeenCalledWith(
      'customers',
      'Nour',
      { bank: 'Arab Bank', iban: IBAN, accountNo: '123-456' },
      null,
      false,
    );
    expect(navigate).toHaveBeenCalledWith(['/contacts', 'customers', 'Nour'], { replaceUrl: true });
  });

  it('saves a contact with no bank details without touching the bank', async () => {
    const { fixture, root, form, bank, navigate } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalled();
    expect(bank.save).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalled();
  });

  it('shows the IBAN error and saves nothing', async () => {
    const { fixture, root, form } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    await type(fixture, fields(root)[4], 'JO95CBJO0010000000000131000302');
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain('Enter a valid IBAN');
    expect(form.save).not.toHaveBeenCalled();
  });

  it('requires a bank once an IBAN or number is typed', async () => {
    const { fixture, root, form } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, fields(root)[5], '12345');
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain('Choose the bank these numbers belong to.');
    expect(form.save).not.toHaveBeenCalled();
  });

  it('makes the owner choose a typed bank from the list or add it, creating it on save', async () => {
    const { fixture, root, form, bank } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Zed Bank');
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain(
      'Choose a bank from the list, or choose “Add bank” to create it.',
    );
    expect(form.save).not.toHaveBeenCalled();
    await press(fixture, root, /Add bank/);
    await press(fixture, root, /Save contact/);
    expect(bank.save).toHaveBeenCalledWith(
      'customers',
      'Nour',
      { bank: 'Zed Bank', iban: '', accountNo: '' },
      null,
      true,
    );
  });

  it('offers no new bank without System Manager', async () => {
    const { fixture, root } = await open({
      roles: ['Accounts Manager', 'Sales User', 'Sales Master Manager', 'Purchase Master Manager'],
    });
    await type(fixture, bankInput(root), 'Zed Bank');
    expect(plain(root)).not.toContain('Add bank');
  });

  it('keeps a saved contact when the bank step fails, retrying only that step', async () => {
    const { fixture, root, form, bank, navigate } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    bank.save.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain('Contact saved, bank details not saved');
    expect(navigate).not.toHaveBeenCalled();
    expect(button(root, /Save contact/)).toBeUndefined();
    expect(bankInput(root)!.readOnly).toBe(true);
    await press(fixture, root, /Try bank details again/);
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(['/contacts', 'customers', 'Nour'], { replaceUrl: true });
  });

  it('lets the user continue without the bank details', async () => {
    const { fixture, root, bank, navigate } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    bank.save.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await press(fixture, root, /Save contact/);
    await press(fixture, root, /Continue without bank details/);
    expect(navigate).toHaveBeenCalledWith(['/contacts', 'customers', 'Nour'], { replaceUrl: true });
    expect(bank.save).toHaveBeenCalledTimes(1);
  });

  it('fills the edit form from the contact’s account and saves nothing for it when unchanged', async () => {
    const { fixture, root, form, bank } = await open({ edit: true, account: ACCOUNT });
    expect(bankInput(root)!.value).toBe('Arab Bank');
    expect(fields(root)[4].value).toBe(IBAN);
    expect(fields(root)[5].value).toBe('123-456');
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).not.toHaveBeenCalled();
  });

  it('updates the loaded account when the IBAN changes', async () => {
    const { fixture, root, bank } = await open({ edit: true, account: ACCOUNT });
    await type(fixture, fields(root)[4], 'GB82 WEST 1234 5698 7654 32');
    await press(fixture, root, /Save contact/);
    expect(bank.save).toHaveBeenCalledWith(
      'customers',
      'Nour',
      { bank: 'Arab Bank', iban: 'GB82WEST12345698765432', accountNo: '123-456' },
      ACCOUNT,
      false,
    );
  });

  it('sends all-empty details when every field is cleared', async () => {
    const { fixture, root, bank } = await open({ edit: true, account: ACCOUNT });
    await type(fixture, bankInput(root), '');
    await type(fixture, fields(root)[4], '');
    await type(fixture, fields(root)[5], '');
    await press(fixture, root, /Save contact/);
    expect(bank.save).toHaveBeenCalledWith(
      'customers',
      'Nour',
      { bank: '', iban: '', accountNo: '' },
      ACCOUNT,
      false,
    );
  });

  it('shows the load error and a Retry when the account fails to load', async () => {
    const { fixture, root, bank } = await open({
      edit: true,
      accountError: new HttpErrorResponse({ status: 500 }),
    });
    expect(plain(root)).toContain("Bank details couldn't be loaded");
    expect(root.querySelector('app-bank-details-section')).toBeNull();
    bank.account.mockResolvedValueOnce(ACCOUNT);
    await press(fixture, root, /^Try again$/);
    expect(bankInput(root)!.value).toBe('Arab Bank');
  });

  it('hides the section, and still saves the contact, when ERPNext forbids the bank list', async () => {
    const { fixture, root, form, bank } = await open({ edit: true, banksError: forbidden() });
    expect(root.querySelector('app-bank-details-section')).toBeNull();
    expect(plain(root)).not.toContain("couldn't be loaded");
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).not.toHaveBeenCalled();
  });

  it('asks to reload when the account changed elsewhere', async () => {
    const { fixture, root, bank } = await open({ edit: true, account: ACCOUNT });
    await type(fixture, fields(root)[4], 'GB82WEST12345698765432');
    bank.save.mockRejectedValueOnce(new BankChangedError());
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain('Bank details changed elsewhere');
    bank.account.mockResolvedValueOnce({
      ...ACCOUNT,
      iban: 'GB82WEST12345698765432',
      modified: 'm9',
    });
    await press(fixture, root, /Reload bank details/);
    expect(button(root, /Save contact/)).toBeDefined();
    expect(fields(root)[4].value).toBe('GB82WEST12345698765432');
  });

  it('does not show the IBAN error while typing, only after leaving the field or saving', async () => {
    const { fixture, root } = await open();
    await type(fixture, fields(root)[4], 'JO95');
    expect(plain(root)).not.toContain('Enter a valid IBAN');
    fields(root)[4].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await fixture.whenStable();
    expect(plain(root)).toContain('Enter a valid IBAN');
  });

  it('blocks saving when bank fields were entered but the bank data is not loaded, until a retry', async () => {
    const { fixture, root, form, bank } = await open({
      edit: true,
      accountError: new HttpErrorResponse({ status: 500 }),
    });
    (fixture.componentInstance as unknown as { iban: { set(v: string): void } }).iban.set(IBAN);
    await fixture.whenStable();
    expect(button(root, /Save contact/).disabled).toBe(true);
    await press(fixture, root, /Save contact/);
    expect(form.save).not.toHaveBeenCalled();
    bank.account.mockResolvedValueOnce(ACCOUNT);
    await press(fixture, root, /^Try again$/);
    expect(button(root, /Save contact/).disabled).toBe(false);
  });

  it('checks the bank fields again before retrying the bank step', async () => {
    const { fixture, root, bank } = await open();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    bank.save.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await press(fixture, root, /Save contact/);
    (fixture.componentInstance as unknown as { iban: { set(v: string): void } }).iban.set('JO95');
    await press(fixture, root, /Try bank details again/);
    expect(bank.save).toHaveBeenCalledTimes(1);
  });

  it('starts a revisit clean: the earlier contact is not updated by the next add', async () => {
    const { fixture, root, form, bank, navigate } = await open();
    const page = fixture.componentInstance as unknown as { ionViewWillEnter(): void };
    page.ionViewWillEnter();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    bank.save.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await press(fixture, root, /Save contact/);
    expect(plain(root)).toContain('Contact saved, bank details not saved');
    expect(form.save.mock.calls[0][2]).toBeNull();

    await press(fixture, root, /Continue without bank details/);
    page.ionViewWillEnter();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(plain(root)).not.toContain('Contact saved, bank details not saved');
    expect(fields(root)[0].value).toBe('');
    expect(bankInput(root)!.value).toBe('');
    expect(bankInput(root)!.readOnly).toBe(false);
    form.save.mockResolvedValueOnce('Other');
    await type(fixture, fields(root)[0], 'Other');
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalledTimes(2);
    expect(form.save.mock.calls[1][2]).toBeNull();
    expect(form.save.mock.calls[1][3]).not.toBe(form.save.mock.calls[0][3]);
    expect(navigate).toHaveBeenLastCalledWith(['/contacts', 'customers', 'Other'], {
      replaceUrl: true,
    });
  });

  it('keeps a save running through a re-entry: same reference, bank step runs, then leaves', async () => {
    const { fixture, root, form, bank, navigate } = await open();
    const page = fixture.componentInstance as unknown as { ionViewWillEnter(): void };
    page.ionViewWillEnter();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    let release!: (id: string) => void;
    form.save.mockReturnValueOnce(new Promise<string>((r) => (release = r)));
    button(root, /Save contact/).click();
    await fixture.whenStable();
    page.ionViewWillEnter();
    await fixture.whenStable();
    expect(fields(root)[0].value).toBe('Nour');
    release('Nour');
    for (let i = 0; i < 5; i++) {
      await fixture.whenStable();
    }
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/contacts', 'customers', 'Nour'], { replaceUrl: true });
  });

  it('keeps the bank failure notice through a re-entry', async () => {
    const { fixture, root, bank } = await open();
    const page = fixture.componentInstance as unknown as { ionViewWillEnter(): void };
    page.ionViewWillEnter();
    await type(fixture, fields(root)[0], 'Nour');
    await type(fixture, bankInput(root), 'Arab Bank');
    bank.save.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await press(fixture, root, /Save contact/);
    page.ionViewWillEnter();
    await fixture.whenStable();
    expect(plain(root)).toContain('Contact saved, bank details not saved');
    await press(fixture, root, /Try bank details again/);
    expect(bank.save).toHaveBeenCalledTimes(2);
  });

  it('ignores a check answer that arrives after an idle reset', async () => {
    const { fixture, root, form } = await open();
    const page = fixture.componentInstance as unknown as {
      ionViewWillEnter(): void;
      check(): Promise<void>;
    };
    page.ionViewWillEnter();
    let release!: (id: string | null) => void;
    form.find.mockReturnValueOnce(new Promise<string | null>((r) => (release = r)));
    const pending = page.check();
    page.ionViewWillEnter();
    release(null);
    await pending;
    await fixture.whenStable();
    expect(form.save).not.toHaveBeenCalled();
    expect(plain(root)).not.toContain("The contact wasn't created");
  });

  it('saves the contact when bank data failed to load and no bank fields were entered', async () => {
    const { fixture, root, form, bank } = await open({
      banksError: new HttpErrorResponse({ status: 500 }),
    });
    await type(fixture, fields(root)[0], 'Nour');
    expect(plain(root)).toContain("Bank details couldn't be loaded");
    expect(button(root, /Save contact/).disabled).toBe(false);
    await press(fixture, root, /Save contact/);
    expect(form.save).toHaveBeenCalledTimes(1);
    expect(bank.save).not.toHaveBeenCalled();
  });
});

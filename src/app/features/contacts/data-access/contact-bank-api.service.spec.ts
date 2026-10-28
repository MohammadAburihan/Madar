import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { BankChangedError, ContactBankApiService } from './contact-bank-api.service';
import { BankAccountRecord } from './contacts.models';

const api = () => TestBed.inject(ContactBankApiService);
const IBAN = 'JO94CBJO0010000000000131000302';
const DETAILS = { bank: 'Arab Bank', iban: IBAN, accountNo: '123-456' };
const ROW = {
  name: 'Customer Nour - Arab Bank',
  bank: 'Arab Bank',
  iban: IBAN,
  bank_account_no: '123-456',
  disabled: 0,
  modified: '2026-10-28 10:00:00',
};
const LOADED: BankAccountRecord = {
  name: ROW.name,
  bank: 'Arab Bank',
  iban: IBAN,
  accountNo: '123-456',
  modified: ROW.modified,
  disabled: false,
};

describe('ContactBankApiService', () => {
  it('lists the banks by name', async () => {
    const { listCalls } = fakeErpnext({
      Bank: () => [{ name: 'Arab Bank' }, { name: 'Cairo Amman' }],
    });
    expect(await api().banks()).toEqual(['Arab Bank', 'Cairo Amman']);
    expect(listCalls[0].query.orderBy).toBe('name asc');
  });

  it("looks up the party's own account, an enabled one first", async () => {
    const { listCalls } = fakeErpnext({ 'Bank Account': () => [ROW] });
    expect(await api().account('customers', 'Nour')).toEqual(LOADED);
    expect(listCalls[0].query.filters).toEqual([
      ['party_type', '=', 'Customer'],
      ['party', '=', 'Nour'],
      ['is_company_account', '=', 0],
    ]);
    expect(listCalls[0].query.orderBy).toBe('disabled asc, modified desc, name asc');
  });

  it('finds no account as null', async () => {
    fakeErpnext();
    expect(await api().account('suppliers', 'Green Clay')).toBeNull();
  });

  it('creates the bank when it is new, then the account named after the party', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => {
          const doc = body['doc'] as { doctype: string };
          return doc.doctype === 'Bank' ? { name: 'Arab Bank' } : { ...ROW, name: 'x' };
        },
      },
    );
    const saved = await api().save('customers', 'Nour', DETAILS, null, true);
    expect(postCalls.map((c) => c.body['doc'])).toEqual([
      { doctype: 'Bank', bank_name: 'Arab Bank' },
      {
        doctype: 'Bank Account',
        account_name: 'Customer Nour',
        bank: 'Arab Bank',
        party_type: 'Customer',
        party: 'Nour',
        is_company_account: 0,
        iban: IBAN,
        bank_account_no: '123-456',
      },
    ]);
    expect(saved?.iban).toBe(IBAN);
  });

  it('uses the existing bank without creating it, and omits empty numbers', async () => {
    const { postCalls } = fakeErpnext(
      { Bank: () => [{ name: 'Arab Bank' }] },
      { 'frappe.client.insert': () => ROW },
    );
    await api().save(
      'suppliers',
      'Green Clay',
      { bank: 'arab bank', iban: '', accountNo: '' },
      null,
      true,
    );
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].body['doc']).toMatchObject({
      account_name: 'Supplier Green Clay',
      bank: 'Arab Bank',
      party_type: 'Supplier',
    });
    expect(postCalls[0].body['doc']).not.toHaveProperty('iban');
  });

  it('survives a bank made by a lost first attempt', async () => {
    let looked = 0;
    fakeErpnext(
      { Bank: () => (looked++ === 0 ? [] : [{ name: 'Arab Bank' }]) },
      {
        'frappe.client.insert': () =>
          throwError(
            () =>
              new HttpErrorResponse({ status: 409, error: { exc_type: 'DuplicateEntryError' } }),
          ),
      },
    );
    expect(await api().ensureBank('Arab Bank')).toBe('Arab Bank');
  });

  it('updates the loaded account in place with its fresh document, and re-enables it', async () => {
    const { postCalls } = fakeErpnext(
      { 'Bank Account': () => [{ ...ROW, disabled: 1 }] },
      { 'frappe.client.save': (body) => ({ ...ROW, ...(body['doc'] as object) }) },
      { [`Bank Account/${ROW.name}`]: { ...ROW, disabled: 1, docstatus: 0 } },
    );
    const next = { ...DETAILS, iban: 'GB82WEST12345698765432' };
    const saved = await api().save('customers', 'Nour', next, { ...LOADED, disabled: true }, false);
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: ROW.name,
      iban: 'GB82WEST12345698765432',
      bank_account_no: '123-456',
      disabled: 0,
      modified: ROW.modified,
    });
    expect(saved?.iban).toBe('GB82WEST12345698765432');
  });

  it('writes nothing when the account already holds the details (a retry after a lost answer)', async () => {
    const { postCalls } = fakeErpnext({ 'Bank Account': () => [ROW] });
    await api().save(
      'customers',
      'Nour',
      DETAILS,
      { ...LOADED, iban: 'old', modified: 'older' },
      false,
    );
    expect(postCalls).toHaveLength(0);
  });

  it('never makes a second account when a retry finds the first one', async () => {
    const rows: unknown[] = [];
    const { postCalls } = fakeErpnext(
      { 'Bank Account': () => rows },
      {
        'frappe.client.insert': () => {
          rows.push(ROW);
          return throwError(() => new HttpErrorResponse({ status: 504 }));
        },
      },
    );
    await expect(api().save('customers', 'Nour', DETAILS, null, false)).rejects.toBeDefined();
    await api().save('customers', 'Nour', DETAILS, null, false);
    expect(postCalls).toHaveLength(1);
  });

  it('refuses to overwrite an account changed since it was loaded', async () => {
    const { postCalls } = fakeErpnext({ 'Bank Account': () => [{ ...ROW, modified: 'later' }] });
    await expect(
      api().save('customers', 'Nour', { ...DETAILS, iban: '' }, LOADED, false),
    ).rejects.toBeInstanceOf(BankChangedError);
    expect(postCalls).toHaveLength(0);
  });

  it('disables the account when every field is cleared, keeping it', async () => {
    const { postCalls } = fakeErpnext(
      { 'Bank Account': () => [ROW] },
      { 'frappe.client.save': (body) => body['doc'] },
      { [`Bank Account/${ROW.name}`]: ROW },
    );
    expect(
      await api().save('customers', 'Nour', { bank: '', iban: ' ', accountNo: '' }, LOADED, false),
    ).toBeNull();
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].method).toBe('frappe.client.save');
    expect(postCalls[0].body['doc']).toMatchObject({ name: ROW.name, disabled: 1, iban: IBAN });
  });

  it('writes nothing when clearing details there already are none of', async () => {
    const { postCalls } = fakeErpnext({ 'Bank Account': () => [{ ...ROW, disabled: 1 }] });
    await api().save('customers', 'Nour', { bank: '', iban: '', accountNo: '' }, LOADED, false);
    expect(postCalls).toHaveLength(0);
  });
});

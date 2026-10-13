import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { PaymentAccountsService } from './payment-accounts.service';

const MODES = () => [
  { name: 'Cash', type: 'Cash', account: 'Cash - RN', company: 'Rehan Nursery' },
  { name: 'Credit Card', type: 'Bank', account: 'Main bank - RN', company: 'Rehan Nursery' },
  { name: 'Wire Transfer', type: 'Bank', account: 'Main bank - RN', company: 'Rehan Nursery' },
  { name: 'Cheque', type: 'Bank', account: null, company: 'Rehan Nursery' },
  { name: 'Cash', type: 'Cash', account: 'Cash - OT', company: 'Other' },
];

describe('PaymentAccountsService', () => {
  it("lists the company's modes with an account, labelled by account name", async () => {
    fakeErpnext({
      'Mode of Payment': MODES,
      Account: () => [
        { name: 'Cash - RN', account_name: 'Main cash' },
        { name: 'Main bank - RN', account_name: 'Main bank' },
      ],
    });
    const accounts = TestBed.inject(PaymentAccountsService);

    expect(await accounts.list('Rehan Nursery', 'all')).toEqual([
      { mode: 'Cash', account: 'Cash - RN', label: 'Main cash', isBank: false },
      { mode: 'Credit Card', account: 'Main bank - RN', label: 'Main bank', isBank: true },
      { mode: 'Wire Transfer', account: 'Main bank - RN', label: 'Main bank', isBank: true },
    ]);
  });

  it('keeps only the modes the role may use, and needs no account lookup when none are left', async () => {
    const { listCalls } = fakeErpnext({ 'Mode of Payment': MODES });
    const accounts = TestBed.inject(PaymentAccountsService);

    expect((await accounts.list('Rehan Nursery', ['Cash'])).map((a) => a.label)).toEqual(['Cash']);
    expect(await accounts.list('Rehan Nursery', [])).toEqual([]);
    expect(listCalls.filter((c) => c.doctype === 'Account')).toHaveLength(1);
  });
});

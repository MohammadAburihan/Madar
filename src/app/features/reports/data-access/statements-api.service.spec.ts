import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { StatementsApiService } from './statements-api.service';

const api = () => TestBed.inject(StatementsApiService);
const RANGE = { from: '2026-09-01', to: '2026-10-14' };
const gl = (
  voucher_type: string,
  voucher_no: string,
  posting_date: string,
  debit: number,
  credit: number,
  creation: string,
) => ({
  voucher_type,
  voucher_no,
  posting_date,
  'SUM(`debit`)': debit,
  'SUM(`credit`)': credit,
  'MIN(`creation`)': creation,
});

describe('StatementsApiService', () => {
  it("builds a customer's statement: opening, each document in posting order with its running balance", async () => {
    const { listCalls } = fakeErpnext({
      'GL Entry': (query) =>
        query.groupBy
          ? [
              gl('Payment Entry', 'PAY-0154', '2026-10-11', 0, 120, '2026-10-11 10:05:00'),
              gl('Sales Invoice', 'SI-1042', '2026-10-11', 320, 0, '2026-10-11 10:00:00'),
              gl('Sales Invoice', 'SI-1038', '2026-09-02', 150, 0, '2026-09-02 09:00:00'),
              gl('Payment Entry', 'PAY-0149', '2026-09-09', 0, 150, '2026-09-09 09:00:00'),
            ]
          : [{ 'SUM(`debit`)': 500, 'SUM(`credit`)': 500 }],
      'Sales Invoice': () => [
        { name: 'SI-1038', is_return: 0, item_name: 'Olive tree', qty: 3 },
        { name: 'SI-1042', is_return: 0, item_name: 'Garden consultation', qty: 1 },
        { name: 'SI-1042', is_return: 0, item_name: 'Soil', qty: 2 },
      ],
      'Payment Entry': () => [
        {
          name: 'PAY-0149',
          paid_to: 'Main cash - RN',
          paid_from: 'Debtors - RN',
          reference_name: 'SI-1038',
        },
        {
          name: 'PAY-0154',
          paid_to: 'Main cash - RN',
          paid_from: 'Debtors - RN',
          reference_name: 'SI-1042',
        },
      ],
    });
    const statement = await api().statement('customer', 'Lina Haddad', 'Rehan Nursery', RANGE);
    expect(statement).toMatchObject({
      opening: 0,
      invoiced: 470,
      paid: 270,
      outstanding: 200,
      invoices: 2,
      payments: 2,
    });
    expect(
      statement.entries.map((e) => [e.voucher, e.kind, e.invoiced, e.paid, e.balance]),
    ).toEqual([
      ['SI-1038', 'invoice', 150, 0, 150],
      ['PAY-0149', 'payment', 0, 150, 0],
      ['SI-1042', 'invoice', 320, 0, 320],
      ['PAY-0154', 'payment', 0, 120, 200],
    ]);
    expect(statement.entries[2].firstItem).toEqual({
      name: 'Garden consultation',
      qty: 1,
      more: 1,
    });
    expect(statement.entries[1]).toMatchObject({ account: 'Main cash', against: ['SI-1038'] });
    const filters = listCalls.find((c) => c.doctype === 'GL Entry')!.query.filters;
    expect(filters).toContainEqual(['party_type', '=', 'Customer']);
    expect(filters).toContainEqual(['is_cancelled', '=', 0]);
  });

  it("counts a supplier's balance as what is owed to them, payments leaving from the paying account", async () => {
    fakeErpnext({
      'GL Entry': (query) =>
        query.groupBy
          ? [
              gl('Purchase Invoice', 'PINV-1', '2026-10-01', 0, 750, '2026-10-01 09:00:00'),
              gl('Payment Entry', 'PAY-1', '2026-10-02', 300, 0, '2026-10-02 09:00:00'),
            ]
          : [{ 'SUM(`debit`)': 0, 'SUM(`credit`)': 100 }],
      'Payment Entry': () => [
        {
          name: 'PAY-1',
          paid_to: 'Creditors - RN',
          paid_from: 'Main bank - RN',
          reference_name: 'PINV-1',
        },
      ],
    });
    const statement = await api().statement('supplier', 'Green Clay', 'Rehan Nursery', RANGE);
    expect([statement.opening, statement.invoiced, statement.paid, statement.outstanding]).toEqual([
      100, 750, 300, 550,
    ]);
    expect(statement.entries[1].account).toBe('Main bank');
  });

  it('renders the PDF on the server from the HTML', async () => {
    const pdf = new Blob(['%PDF']);
    const { postCalls } = fakeErpnext({}, { 'frappe.utils.print_format.report_to_pdf': () => pdf });
    expect(await api().pdf('<html></html>')).toBe(pdf);
    expect(postCalls[0].body).toEqual({ html: '<html></html>', orientation: 'Portrait' });
  });
});

import { UnpaidInvoice, allocate } from './collection.models';

const invoice = (name: string, postingDate: string, outstanding: number): UnpaidInvoice => ({
  name,
  postingDate,
  dueDate: null,
  total: outstanding,
  outstanding,
  receivable: 'Debtors - RN',
});

describe('allocate', () => {
  it('pays the oldest invoice first and caps each at what it owes', () => {
    const invoices = [invoice('SI-2', '2026-10-12', 100), invoice('SI-1', '2026-10-01', 50)];
    expect(allocate(invoices, 120)).toEqual([
      { invoice: 'SI-1', amount: 50 },
      { invoice: 'SI-2', amount: 70 },
    ]);
  });

  it('stops once the amount is used and rounds to cents', () => {
    const invoices = [
      invoice('SI-1', '2026-10-01', 10.005),
      invoice('SI-2', '2026-10-02', 30),
      invoice('SI-3', '2026-10-03', 30),
    ];
    expect(allocate(invoices, 20.1)).toEqual([
      { invoice: 'SI-1', amount: 10.01 },
      { invoice: 'SI-2', amount: 10.09 },
    ]);
    expect(allocate(invoices, 0)).toEqual([]);
  });
});

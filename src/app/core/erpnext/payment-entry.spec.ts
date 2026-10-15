import { spreadAllocation, withoutLocalFlags } from './payment-entry';

describe('spreadAllocation', () => {
  it('fills payment-term rows in order without allocating more than a term owes', () => {
    const rows = [
      { reference_name: 'PINV-1', payment_term_outstanding: 100, outstanding_amount: 300 },
      { reference_name: 'PINV-1', payment_term_outstanding: 200, outstanding_amount: 300 },
    ];
    expect(spreadAllocation(rows, 150).map((r) => r['allocated_amount'])).toEqual([100, 50]);
    expect(spreadAllocation(rows, 80).map((r) => r['allocated_amount'])).toEqual([80]);
  });
});

describe('withoutLocalFlags', () => {
  it("drops a new document's double-underscore flags", () => {
    expect(withoutLocalFlags({ __islocal: 1, __unsaved: 1, name: 'x' })).toEqual({ name: 'x' });
  });
});

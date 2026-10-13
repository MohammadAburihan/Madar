import { capabilitiesFor } from './capabilities';

describe('capabilitiesFor', () => {
  it('lets the owner do everything', () => {
    expect(capabilitiesFor('owner')).toEqual({
      sell: true,
      sellToWalkIn: true,
      editPrice: true,
      maxDiscount: 100,
      paymentModes: 'all',
    });
  });

  it('gives both sales roles the same limits: no price edits, 10% discount, Cash or Card', () => {
    for (const persona of ['salesperson', 'storeAssociate'] as const) {
      expect(capabilitiesFor(persona)).toEqual({
        sell: true,
        sellToWalkIn: true,
        editPrice: false,
        maxDiscount: 10,
        paymentModes: ['Cash', 'Credit Card'],
      });
    }
  });

  it("doesn't let warehouse workers sell", () => {
    const caps = capabilitiesFor('warehouse');
    expect(caps.sell).toBe(false);
    expect(caps.sellToWalkIn).toBe(false);
    expect(caps.maxDiscount).toBe(0);
    expect(caps.paymentModes).toEqual([]);
  });
});

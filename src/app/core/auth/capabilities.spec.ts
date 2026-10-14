import { capabilitiesFor } from './capabilities';

describe('capabilitiesFor', () => {
  it('lets the owner do everything', () => {
    expect(capabilitiesFor('owner')).toEqual({
      sell: true,
      sellToWalkIn: true,
      editPrice: true,
      maxDiscount: 100,
      paymentModes: 'all',
      collect: true,
      money: 'all',
      transferStock: true,
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
        collect: true,
        money: 'own',
        transferStock: persona === 'storeAssociate',
      });
    }
  });

  it('lets the owner, store associate and warehouse worker move stock, not the salesperson', () => {
    expect(capabilitiesFor('owner').transferStock).toBe(true);
    expect(capabilitiesFor('storeAssociate').transferStock).toBe(true);
    expect(capabilitiesFor('warehouse').transferStock).toBe(true);
    expect(capabilitiesFor('salesperson').transferStock).toBe(false);
  });

  it("doesn't let warehouse workers sell", () => {
    const caps = capabilitiesFor('warehouse');
    expect(caps.sell).toBe(false);
    expect(caps.sellToWalkIn).toBe(false);
    expect(caps.maxDiscount).toBe(0);
    expect(caps.paymentModes).toEqual([]);
    expect(caps.collect).toBe(false);
    expect(caps.money).toBe('none');
  });
});

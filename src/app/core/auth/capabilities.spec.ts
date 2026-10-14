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
      orderPurchases: true,
      receiveGoods: true,
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
        orderPurchases: false,
        receiveGoods: persona === 'storeAssociate',
      });
    }
  });

  it('lets the owner, store associate and warehouse worker move stock, not the salesperson', () => {
    expect(capabilitiesFor('owner').transferStock).toBe(true);
    expect(capabilitiesFor('storeAssociate').transferStock).toBe(true);
    expect(capabilitiesFor('warehouse').transferStock).toBe(true);
    expect(capabilitiesFor('salesperson').transferStock).toBe(false);
  });

  it('only lets users whose ERPNext roles can create stock entries move stock', () => {
    expect(capabilitiesFor('owner', ['Accounts Manager']).transferStock).toBe(false);
    expect(capabilitiesFor('owner', ['System Manager', 'Stock User']).transferStock).toBe(true);
    // Stock Manager alone can't read Warehouse in v16.
    expect(capabilitiesFor('warehouse', ['Stock Manager']).transferStock).toBe(false);
    expect(capabilitiesFor('warehouse', ['Stock Manager', 'Item Manager']).transferStock).toBe(
      true,
    );
    expect(capabilitiesFor('warehouse', ['Stock User']).transferStock).toBe(true);
    expect(capabilitiesFor('salesperson', ['Sales User', 'Stock User']).transferStock).toBe(false);
    expect(capabilitiesFor('owner', ['Accounts Manager', 'Manufacturing User']).transferStock).toBe(
      false,
    );
  });

  it('lets the owner and the purchasing officer order from suppliers, as their ERPNext roles allow', () => {
    expect(capabilitiesFor('purchasing')).toMatchObject({
      orderPurchases: true,
      sell: false,
      money: 'none',
      transferStock: false,
    });
    expect(capabilitiesFor('warehouse').orderPurchases).toBe(false);
    expect(capabilitiesFor('owner', ['Accounts Manager']).orderPurchases).toBe(false);
    expect(capabilitiesFor('owner', ['System Manager', 'Purchase Manager']).orderPurchases).toBe(
      true,
    );
    expect(capabilitiesFor('purchasing', ['Purchase User', 'Stock User']).orderPurchases).toBe(
      true,
    );
  });

  it('lets every role but the salesperson receive goods, as their ERPNext roles allow (PERMISSIONS.md)', () => {
    for (const persona of ['owner', 'storeAssociate', 'warehouse', 'purchasing'] as const) {
      expect(capabilitiesFor(persona).receiveGoods).toBe(true);
    }
    expect(capabilitiesFor('salesperson').receiveGoods).toBe(false);
    expect(capabilitiesFor('warehouse', ['Stock User']).receiveGoods).toBe(true);
    expect(capabilitiesFor('purchasing', ['Purchase User']).receiveGoods).toBe(true);
    // Purchase Manager can't create receipts in v16, and Stock Manager can't read purchase orders.
    expect(capabilitiesFor('owner', ['System Manager', 'Purchase Manager']).receiveGoods).toBe(
      false,
    );
    expect(capabilitiesFor('owner', ['Stock Manager']).receiveGoods).toBe(false);
    // Managers alone can't read Warehouse, so they couldn't choose where the goods go.
    expect(capabilitiesFor('owner', ['Stock Manager', 'Purchase Manager']).receiveGoods).toBe(
      false,
    );
    expect(
      capabilitiesFor('owner', ['Stock Manager', 'Purchase Manager', 'Item Manager']).receiveGoods,
    ).toBe(true);
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

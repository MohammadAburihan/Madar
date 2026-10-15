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
      seeCosts: true,
      recordSupplierInvoices: true,
      paySuppliers: true,
      recordExpenses: true,
      manageProjects: true,
      supplyProjects: true,
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
        seeCosts: false,
        recordSupplierInvoices: false,
        paySuppliers: false,
        recordExpenses: false,
        manageProjects: false,
        supplyProjects: persona === 'storeAssociate',
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

  it('shows buying prices to the owner and the purchasing officer only (PERMISSIONS.md)', () => {
    expect(capabilitiesFor('owner').seeCosts).toBe(true);
    expect(capabilitiesFor('purchasing').seeCosts).toBe(true);
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse'] as const) {
      expect(capabilitiesFor(persona).seeCosts).toBe(false);
    }
  });

  it('lets the owner and the purchasing officer record supplier invoices, as their ERPNext roles allow', () => {
    expect(capabilitiesFor('purchasing').recordSupplierInvoices).toBe(true);
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse'] as const) {
      expect(capabilitiesFor(persona).recordSupplierInvoices).toBe(false);
    }
    expect(
      capabilitiesFor('purchasing', ['Purchase User', 'Stock User', 'Accounts User'])
        .recordSupplierInvoices,
    ).toBe(true);
    // Purchase User alone can read invoices but not create them in v16.
    expect(capabilitiesFor('purchasing', ['Purchase User']).recordSupplierInvoices).toBe(false);
    expect(capabilitiesFor('owner', ['Accounts Manager']).recordSupplierInvoices).toBe(false);
    expect(
      capabilitiesFor('owner', ['Accounts Manager', 'Purchase Manager', 'Stock Manager'])
        .recordSupplierInvoices,
    ).toBe(true);
  });

  it('lets only the owner pay suppliers, as their ERPNext roles allow', () => {
    expect(capabilitiesFor('owner').paySuppliers).toBe(true);
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse', 'purchasing'] as const) {
      expect(capabilitiesFor(persona).paySuppliers).toBe(false);
    }
    expect(capabilitiesFor('owner', ['System Manager']).paySuppliers).toBe(false);
    expect(capabilitiesFor('owner', ['Accounts Manager']).paySuppliers).toBe(true);
  });

  it('lets only the owner record expenses, as their ERPNext roles allow', () => {
    expect(capabilitiesFor('owner').recordExpenses).toBe(true);
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse', 'purchasing'] as const) {
      expect(capabilitiesFor(persona).recordExpenses).toBe(false);
    }
    expect(capabilitiesFor('owner', ['System Manager']).recordExpenses).toBe(false);
    expect(capabilitiesFor('owner', ['Accounts Manager']).recordExpenses).toBe(true);
  });

  it('lets the owner manage projects when they hold a projects role and can raise material requests', () => {
    expect(capabilitiesFor('owner').manageProjects).toBe(true);
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse', 'purchasing'] as const) {
      expect(capabilitiesFor(persona).manageProjects).toBe(false);
    }
    expect(capabilitiesFor('owner', ['Accounts Manager', 'Stock Manager']).manageProjects).toBe(
      false,
    );
    expect(capabilitiesFor('owner', ['Projects Manager', 'Stock Manager']).manageProjects).toBe(
      true,
    );
  });

  it('lets the roles in PERMISSIONS.md supply projects, when ERPNext lets them read projects and move stock', () => {
    for (const persona of ['owner', 'storeAssociate', 'warehouse', 'projectManager'] as const) {
      expect(capabilitiesFor(persona).supplyProjects).toBe(true);
    }
    expect(capabilitiesFor('salesperson').supplyProjects).toBe(false);
    expect(capabilitiesFor('purchasing').supplyProjects).toBe(false);
    expect(capabilitiesFor('projectManager', ['Projects User', 'Stock User']).supplyProjects).toBe(
      true,
    );
    // A warehouse worker also needs Projects User to read the project in v16.
    expect(capabilitiesFor('warehouse', ['Stock User']).supplyProjects).toBe(false);
    expect(capabilitiesFor('warehouse', ['Stock User', 'Projects User']).supplyProjects).toBe(true);
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

import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { DeliveryStore } from './delivery.store';
import { SalesOrderApiService } from './sales-order-api.service';
import { SalesOrderDetail } from './sales-order.models';

const ORDER: SalesOrderDetail = {
  name: 'SO-1',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  docstatus: 1,
  status: 'To Deliver and Bill',
  deliveryStatus: 'Partly Delivered',
  billingStatus: 'Not Billed',
  date: '2026-10-16',
  deliveryDate: '2026-10-16',
  quotation: null,
  total: 320,
  lines: [
    {
      row: 'tree',
      code: 'OLV-20',
      name: 'Olive tree',
      uom: 'Unit',
      qty: 3,
      deliveredQty: 1,
      conversionFactor: 1,
      bySupplier: false,
      rate: 85,
      amount: 255,
      isStock: true,
    },
    {
      row: 'visit',
      code: 'SRV-GARDEN',
      name: 'Garden consultation',
      uom: 'Visit',
      qty: 1,
      deliveredQty: 0,
      conversionFactor: 1,
      bySupplier: false,
      rate: 150,
      amount: 150,
      isStock: false,
    },
  ],
};

function setup(order: SalesOrderDetail = ORDER) {
  const api = {
    order: vi.fn().mockResolvedValue(order),
    stock: vi.fn().mockResolvedValue({ 'OLV-20': { main: 24, shop: 1 } }),
    deliver: vi.fn(),
    findDelivery: vi.fn(),
    discardDelivery: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesOrderApiService, useValue: api },
      { provide: BusinessService, useValue: { ensure: () => Promise.resolve({ name: 'RN' }) } },
      {
        provide: WarehouseDirectoryService,
        useValue: {
          list: () =>
            Promise.resolve([
              { id: 'shop', name: 'Garden shop' },
              { id: 'main', name: 'Main warehouse' },
            ]),
        },
      },
    ],
  });
  const store = TestBed.inject(DeliveryStore);
  store.start('SO-1');
  return { store, api };
}

describe('DeliveryStore', () => {
  it('suggests the rest of the goods from the warehouse holding most, and no service work yet', async () => {
    const { store } = setup();
    await store.load();
    expect(store.warehouse()).toBe('main');
    expect(store.qtyInputs()).toEqual({ tree: '2', visit: '0' });
    expect(store.ready()).toBe(true);
  });

  it('refuses more than is open on the row or in stock in the chosen warehouse', async () => {
    const { store } = setup();
    await store.load();
    const tree = ORDER.lines[0];
    store.setQty('tree', '3');
    expect(store.qtyError(tree)).toBe('tooMany');
    store.setWarehouse('shop');
    store.setQty('tree', '2');
    expect([store.qtyError(tree), store.ready()]).toEqual(['noStock', false]);
    store.setQty('tree', '0');
    store.setQty('visit', '1');
    expect([store.qtyError(ORDER.lines[1]), store.ready()]).toEqual([null, true]);
  });

  it('posts only the rows delivering something, once for a double tap', async () => {
    const { store, api } = setup();
    await store.load();
    api.deliver.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('DN-1');
      return 'DN-1';
    });
    const first = store.confirm();
    void store.confirm();
    await first;
    expect(api.deliver).toHaveBeenCalledTimes(1);
    expect(api.deliver.mock.calls[0][0]).toMatchObject({
      order: 'SO-1',
      warehouse: 'main',
      lines: [{ row: 'tree', qty: 2 }],
    });
    expect([store.state(), store.result()]).toEqual(['confirmed', 'DN-1']);
  });

  it('keeps an unresolved delivery through a fresh visit and checks it only once it gave up', async () => {
    const { store, api } = setup();
    await store.load();
    api.deliver.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('DN-1');
      throw new UnresolvedError();
    });
    await store.confirm();
    store.resume('SO-1');
    expect([store.state(), store.draft()]).toEqual(['unresolved', 'DN-1']);
    api.findDelivery.mockResolvedValue({ delivery: 'DN-1' });
    expect(await store.checkResult()).toBe('found');
    expect(store.result()).toBe('DN-1');
  });

  it('cleans up a draft a failed delivery left behind, and says when stock ran out', async () => {
    const { store, api } = setup();
    await store.load();
    api.deliver.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('DN-LEFT');
      throw new HttpErrorResponse({
        status: 417,
        error: { exc_type: 'NegativeStockError' },
      });
    });
    await store.confirm();
    expect(store.failure()).toBe('stock');
    store.start('SO-1');
    expect(api.discardDelivery).toHaveBeenCalledWith('DN-LEFT');
  });

  it('reports an earlier delivery that stands as changed, with a fresh reference', async () => {
    const { store, api } = setup();
    await store.load();
    const reference = store.reference();
    api.deliver.mockRejectedValue(new PostedEarlierError('DN-1'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(reference);
    // Its open quantities are out of date: no second delivery until the order is reloaded.
    store.setQty('tree', '1');
    expect([store.failure(), store.ready()]).toEqual(['changed', false]);
  });

  it('shares an item’s stock across its rows and leaves drop-shipped rows out', async () => {
    const tree = ORDER.lines[0];
    const { store } = setup({
      ...ORDER,
      lines: [
        { ...tree, qty: 15, deliveredQty: 0 },
        { ...tree, row: 'tree-2', qty: 15, deliveredQty: 0 },
        { ...tree, row: 'shipped', deliveredQty: 0, bySupplier: true },
      ],
    });
    await store.load();
    expect(store.openLines().map((l) => l.row)).toEqual(['tree', 'tree-2']);
    // 24 in Main: 13 + 13 is too many together, though each row alone fits.
    store.setQty('tree', '13');
    store.setQty('tree-2', '13');
    expect([store.qtyError(store.openLines()[0]), store.ready()]).toEqual(['noStock', false]);
    store.setQty('tree-2', '11');
    expect(store.ready()).toBe(true);
  });

  it('has nothing to deliver on a closed order', async () => {
    const { store } = setup({ ...ORDER, status: 'Closed' });
    await store.load();
    expect(store.openLines()).toEqual([]);
  });

  it('takes a removed row out of the delivery until it is added back', async () => {
    const { store, api } = setup();
    await store.load();
    store.setQty('visit', '1');

    store.removeRow('tree');
    expect([store.qtyInputs()['tree'], [...store.removed()], store.deliveringNow()]).toEqual([
      '0',
      ['tree'],
      1,
    ]);
    api.deliver.mockResolvedValue('DN-1');
    await store.confirm();
    expect(api.deliver.mock.calls[0][0].lines).toEqual([{ row: 'visit', qty: 1 }]);

    store.start('SO-1');
    await store.load();
    store.removeRow('tree');
    expect(store.ready()).toBe(false);
    store.addBackRow('tree');
    expect([store.qtyInputs()['tree'], store.removed().size, store.ready()]).toEqual([
      '2',
      0,
      true,
    ]);
  });

  it('restores a row’s default quantity when it is added back', async () => {
    const { store } = setup();
    await store.load();
    store.setQty('visit', '1');
    store.removeRow('visit');
    store.removeRow('tree');

    store.addBackRow('visit');
    store.addBackRow('tree');
    expect([store.qtyInputs()['visit'], store.qtyInputs()['tree'], store.removed().size]).toEqual([
      '0',
      '2',
      0,
    ]);
  });
});

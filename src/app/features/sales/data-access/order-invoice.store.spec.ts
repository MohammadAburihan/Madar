import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { OrderInvoiceStore } from './order-invoice.store';
import { InvoiceChangedError, SalesOrderApiService } from './sales-order-api.service';

const PREVIEW = {
  lines: [{ code: 'OLV-20', name: 'Olive tree', qty: 2, amount: 170, isStock: true }],
  total: 170,
};
const INVOICE = { name: 'SI-1', total: 170, outstanding: 170 };

function setup() {
  const api = {
    order: vi.fn().mockResolvedValue({ name: 'SO-1', lines: [] }),
    invoicePreview: vi.fn().mockResolvedValue(PREVIEW),
    invoice: vi.fn(),
    findInvoice: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesOrderApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'RN', currency: 'ILS' }) },
      },
    ],
  });
  const store = TestBed.inject(OrderInvoiceStore);
  store.start('SO-1');
  return { store, api };
}

describe('OrderInvoiceStore', () => {
  it('invoices the reviewed total once for a double tap', async () => {
    const { store, api } = setup();
    await store.load();
    api.invoice.mockResolvedValue(INVOICE);
    const first = store.confirm();
    void store.confirm();
    await first;
    expect(api.invoice).toHaveBeenCalledTimes(1);
    expect(api.invoice.mock.calls[0][0]).toMatchObject({
      order: 'SO-1',
      currency: 'ILS',
      total: 170,
    });
    expect([store.state(), store.result()]).toEqual(['confirmed', INVOICE]);
  });

  it('says there is nothing left when ERPNext has every row billed', async () => {
    const { store, api } = setup();
    api.invoicePreview.mockRejectedValue(new HttpErrorResponse({ status: 417 }));
    await store.load();
    expect([store.preview(), store.failure()]).toEqual([null, 'nothing']);
  });

  it('remembers a left-behind draft per order, since invoicing roles can’t delete it', async () => {
    const { store, api } = setup();
    await store.load();
    api.invoice.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('SI-LEFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.start('SO-1');
    expect(store.draft()).toBe('SI-LEFT');
    store.start('SO-2');
    expect(store.draft()).toBeNull();
    store.start('SO-1');
    expect(store.draft()).toBe('SI-LEFT');
  });

  it('asks for a new review when the amount changed, and checks an unresolved one only once it gave up', async () => {
    const { store, api } = setup();
    await store.load();
    api.invoice.mockRejectedValueOnce(new InvoiceChangedError());
    await store.confirm();
    expect(store.failure()).toBe('changed');
    api.invoice.mockRejectedValueOnce(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    api.findInvoice.mockResolvedValue({ invoice: INVOICE });
    expect(await store.checkResult()).toBe('found');
    expect(store.result()).toEqual(INVOICE);
  });
});

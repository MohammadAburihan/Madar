import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { PurchaseApiService } from './purchase-api.service';
import { InvoicePreview, OrderDetail } from './purchase.models';
import { BillingChangedError, SupplierInvoiceApiService } from './supplier-invoice-api.service';
import { SupplierInvoiceStore } from './supplier-invoice.store';

const ORDER = { name: 'PO-2048', supplierName: 'Green Clay' } as OrderDetail;

const PREVIEW: InvoicePreview = {
  receipts: ['MAT-PRE-1'],
  lines: [{ code: 'POT-30', name: 'Ceramic planter', uom: 'Unit', qty: 6, rate: 45 }],
  currency: 'ILS',
  total: 270,
  blocked: null,
};

function setup(preview: InvoicePreview = PREVIEW) {
  const orders = { order: vi.fn().mockResolvedValue(ORDER) };
  const api = {
    preview: vi.fn().mockResolvedValue(preview),
    record: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseApiService, useValue: orders },
      { provide: SupplierInvoiceApiService, useValue: api },
    ],
  });
  return { store: TestBed.inject(SupplierInvoiceStore), api };
}

async function loaded(preview: InvoicePreview = PREVIEW) {
  const ctx = setup(preview);
  ctx.store.start('PO-2048');
  await ctx.store.load();
  ctx.store.setBillNo(' GC-8831 ');
  return ctx;
}

describe('SupplierInvoiceStore', () => {
  it("is ready with the supplier's number and something to bill", async () => {
    const { store } = await loaded();
    expect(store.ready()).toBe(true);
    store.setBillNo('  ');
    expect(store.ready()).toBe(false);
  });

  it('is never ready when the receipts must be billed in ERPNext', async () => {
    const { store } = await loaded({ ...PREVIEW, blocked: 'sharedReceipt' });
    expect(store.ready()).toBe(false);
  });

  it('is never ready when every received item is already billed', async () => {
    const { store } = await loaded({ ...PREVIEW, receipts: [], lines: [] });
    expect(store.ready()).toBe(false);
  });

  it("records the previewed receipts with the trimmed supplier's number", async () => {
    const { store, api } = await loaded();
    api.record.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PINV-0068');
      return 'PINV-0068';
    });
    await store.confirm();
    expect(api.record.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      order: 'PO-2048',
      billNo: 'GC-8831',
      receipts: ['MAT-PRE-1'],
      total: 270,
    });
    expect([store.draft(), store.state(), store.result()]).toEqual([
      'PINV-0068',
      'confirmed',
      'PINV-0068',
    ]);
  });

  it('ignores a second tap while confirming', async () => {
    const { store, api } = await loaded();
    api.record.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await store.confirm();
    expect(api.record).toHaveBeenCalledTimes(1);
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await loaded();
    api.record.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('keeps an unresolved invoice through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await loaded();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume('PO-2048');
    expect(store.order()).not.toBeNull();
    api.find.mockResolvedValue({ invoice: 'PINV-0068' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
    expect(store.result()).toBe('PINV-0068');
  });

  it('starts a new reference when an earlier, different invoice was already posted', async () => {
    const { store, api } = await loaded();
    const first = store.reference();
    store.draft.set('PINV-0068');
    api.record.mockRejectedValue(new PostedEarlierError('PINV-0068'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(first);
  });

  it('deletes a leftover draft when the task starts over, even after an edit cleared the failure', async () => {
    const { store, api } = await loaded();
    api.record.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PINV-0068');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.setBillNo('GC-8832');
    expect(store.state()).toBe('idle');
    store.start('PO-2048');
    expect(api.discard).toHaveBeenCalledWith('PINV-0068');
  });

  it("doesn't apply a preview that loads after the task started over", async () => {
    const { store, api } = setup();
    let finish!: (preview: InvoicePreview) => void;
    api.preview.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    store.start('PO-2048');
    const loading = store.load();
    await new Promise((resolve) => setTimeout(resolve));
    store.start('PO-2049');
    finish(PREVIEW);
    await loading;
    expect(store.preview()).toBeNull();
  });

  it('asks to reload when the receipts were billed elsewhere since the preview', async () => {
    const { store, api } = await loaded();
    const first = store.reference();
    api.record.mockRejectedValue(new BillingChangedError());
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'changed']);
    expect(store.reference()).not.toBe(first);
  });

  it('names a permission failure', async () => {
    const { store, api } = await loaded();
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'permission']);
  });
});

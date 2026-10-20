import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { SessionService } from '../auth/session.service';
import { UnresolvedError } from '../erpnext/confirmation';
import { ErpnextError } from '../erpnext/erpnext-error';
import { DraftDeletionService } from './draft-deletion.service';

const COMPANY = 'Rehan Nursery';

function setup(
  lists: Parameters<typeof fakeErpnext>[0] = {},
  posts: Parameters<typeof fakeErpnext>[1] = {},
) {
  const calls = fakeErpnext(lists, posts);
  const checkExpired = vi.fn().mockResolvedValue(false);
  TestBed.configureTestingModule({
    providers: [{ provide: SessionService, useValue: { checkExpired } }],
  });
  return { ...calls, checkExpired, service: TestBed.inject(DraftDeletionService) };
}

const draft = { docstatus: 0, company: COMPANY };
const refused = () => throwError(() => new ErpnextError('forbidden', 'no', 403));

describe('DraftDeletionService.allowed', () => {
  it('asks ERPNext for the delete right on that document and returns its answer', async () => {
    const { service, getCalls } = setup(
      {},
      { 'frappe.client.has_permission': () => ({ has_permission: true }) },
    );

    expect(await service.allowed('purchase', 'PO-1')).toBe(true);
    expect(getCalls).toEqual([
      {
        method: 'frappe.client.has_permission',
        params: { doctype: 'Purchase Order', docname: 'PO-1', perm_type: 'delete' },
      },
    ]);
  });

  it('says no when ERPNext says no or refuses, and fails on a lost connection', async () => {
    const no = setup({}, { 'frappe.client.has_permission': () => ({ has_permission: false }) });
    expect(await no.service.allowed('sale', 'SI-1')).toBe(false);

    TestBed.resetTestingModule();
    const forbidden = setup({}, { 'frappe.client.has_permission': refused });
    expect(await forbidden.service.allowed('sale', 'SI-1')).toBe(false);

    TestBed.resetTestingModule();
    const offline = setup(
      {},
      {
        'frappe.client.has_permission': () => throwError(() => new ErpnextError('offline', 'down')),
      },
    );
    await expect(offline.service.allowed('sale', 'SI-1')).rejects.toMatchObject({
      kind: 'offline',
    });
  });

  it('checks for an expired session after a refusal, and does not call that a no', async () => {
    const { service, checkExpired } = setup({}, { 'frappe.client.has_permission': refused });
    checkExpired.mockResolvedValue(true);
    await expect(service.allowed('sale', 'SI-1')).rejects.toMatchObject({ kind: 'forbidden' });
    expect(checkExpired).toHaveBeenCalledTimes(1);
  });
});

describe('DraftDeletionService.delete', () => {
  it('reads the draft again, then deletes it by name', async () => {
    const { service, listCalls, postCalls } = setup(
      { 'Sales Invoice': () => [draft] },
      { 'frappe.client.delete': () => ({}) },
    );

    expect(await service.delete('sale', 'SI-1', COMPANY)).toBe('deleted');

    expect(listCalls[0]).toMatchObject({
      doctype: 'Sales Invoice',
      query: { filters: [['name', '=', 'SI-1']] },
    });
    expect(postCalls).toEqual([
      { method: 'frappe.client.delete', body: { doctype: 'Sales Invoice', name: 'SI-1' } },
    ]);
  });

  it('deletes nothing when the document was confirmed, belongs to another business, or is gone', async () => {
    for (const rows of [
      [{ docstatus: 1, company: COMPANY }],
      [{ docstatus: 0, company: 'Other Co' }],
      [],
    ]) {
      TestBed.resetTestingModule();
      const { service, postCalls } = setup({ Quotation: () => rows });
      expect(await service.delete('quotation', 'QT-1', COMPANY)).toBe('changed');
      expect(postCalls).toEqual([]);
    }
  });

  it('maps a refusal to permission, after checking whether the session expired', async () => {
    const { service, checkExpired } = setup(
      { 'Sales Order': () => [draft] },
      { 'frappe.client.delete': refused },
    );
    await expect(service.delete('order', 'SO-1', COMPANY)).rejects.toMatchObject({
      failure: 'permission',
    });
    expect(checkExpired).toHaveBeenCalled();
  });

  it('maps a link to another document to linked', async () => {
    const { service } = setup(
      { 'Sales Order': () => [draft] },
      {
        'frappe.client.delete': () =>
          throwError(() => new ErpnextError('server', 'linked', 417, 'LinkExistsError')),
      },
    );
    await expect(service.delete('order', 'SO-1', COMPANY)).rejects.toMatchObject({
      failure: 'linked',
    });
  });

  it('never assumes a lost delete went through, but finds it gone on the retry', async () => {
    let rows: unknown[] = [draft];
    const { service } = setup(
      { 'Purchase Order': () => rows },
      {
        'frappe.client.delete': () => throwError(() => new UnresolvedError()),
      },
    );
    await expect(service.delete('purchase', 'PO-1', COMPANY)).rejects.toMatchObject({
      failure: 'offline',
    });

    rows = [];
    expect(await service.delete('purchase', 'PO-1', COMPANY)).toBe('deleted');
    expect(await service.delete('purchase', 'PO-1', COMPANY)).toBe('changed');
  });

  it('treats another failed delete as unknown too', async () => {
    let rows: unknown[] = [draft];
    const { service } = setup(
      { 'Payment Entry': () => rows },
      { 'frappe.client.delete': () => throwError(() => new ErpnextError('server', 'boom', 500)) },
    );
    await expect(service.delete('payment', 'PAY-1', COMPANY)).rejects.toMatchObject({
      failure: 'error',
    });
    rows = [];
    expect(await service.delete('payment', 'PAY-1', COMPANY)).toBe('deleted');
  });

  it('does not count a failed re-read as an unknown delete', async () => {
    let fail = true;
    const { service } = setup({
      Quotation: () => (fail ? throwError(() => new ErpnextError('offline', 'down')) : []),
    });
    await expect(service.delete('quotation', 'QT-1', COMPANY)).rejects.toMatchObject({
      failure: 'offline',
    });
    fail = false;
    expect(await service.delete('quotation', 'QT-1', COMPANY)).toBe('changed');
  });
});

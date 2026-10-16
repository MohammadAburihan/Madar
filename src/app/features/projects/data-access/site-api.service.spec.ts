import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError } from '../../../core/erpnext/confirmation';
import { SiteRequest } from './project.models';
import { SiteApiService } from './site-api.service';

const SITE = 'Project sites - RN';
const request = (overrides: Partial<SiteRequest> = {}): SiteRequest => ({
  reference: 'USE-ABC1234',
  company: 'Rehan Nursery',
  project: 'PROJ-0001',
  item: 'POT-30',
  uom: 'Unit',
  qty: 5,
  site: SITE,
  to: null,
  ...overrides,
});

const api = () => TestBed.inject(SiteApiService);
const posting = () =>
  fakeErpnext(
    {},
    {
      'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'STE-1' }),
      'frappe.client.submit': () => ({ name: 'STE-1' }),
    },
  );

describe('SiteApiService', () => {
  it('adds up what reached the site, was used there and went back, for this project only', async () => {
    fakeErpnext({
      Warehouse: (query) =>
        query.filters?.some((f) => f[0] === 'warehouse_name' && f[1] === '=')
          ? [{ name: SITE }]
          : [
              { name: 'Main warehouse - RN', warehouse_name: 'Main warehouse' },
              { name: 'Garden shop - RN', warehouse_name: 'Garden shop' },
            ],
      'Stock Entry': () => [
        { project: 'PROJ-0001', qty: 6, s: 'Main warehouse - RN', t: SITE },
        { project: 'PROJ-0001', qty: 2, s: 'Garden shop - RN', t: SITE },
        { project: 'PROJ-0001', qty: 5, s: SITE, t: null },
        { project: 'PROJ-0001', qty: 1, s: SITE, t: 'Main warehouse - RN' },
        { project: 'PROJ-0009', qty: 40, s: 'Main warehouse - RN', t: SITE },
      ],
      Item: () => [{ name: 'POT-30', item_name: 'Ceramic planter', stock_uom: 'Unit' }],
      Bin: () => [{ warehouse: 'Main warehouse - RN', actual_qty: 1 }],
      'Stock Ledger Entry': () => [{ 'SUM(`actual_qty`)': 2 }],
      'Purchase Order': () => [],
    });
    expect(await api().balance('PROJ-0001', 'POT-30', 'Rehan Nursery')).toEqual({
      item: 'POT-30',
      itemName: 'Ceramic planter',
      uom: 'Unit',
      site: SITE,
      delivered: 8,
      consumed: 5,
      returned: 1,
      atSite: 2,
      pendingOrders: [],
      warehouses: [
        { warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 1 },
        { warehouse: 'Garden shop - RN', name: 'Garden shop', qty: 0 },
      ],
      returnTo: 'Main warehouse - RN',
    });
  });

  it('has no balance before any project was supplied, and creates no warehouse', async () => {
    const { postCalls } = fakeErpnext({ Warehouse: () => [] });
    expect(await api().balance('PROJ-0001', 'POT-30', 'Rehan Nursery')).toBeNull();
    expect(postCalls).toEqual([]);
  });

  it('records use as a Material Issue from the site, booked to the project', async () => {
    const { postCalls } = posting();
    expect(await api().post(request(), null)).toBe('STE-1');
    expect(postCalls[0].body['doc']).toMatchObject({
      stock_entry_type: 'Material Issue',
      project: 'PROJ-0001',
      from_warehouse: SITE,
      remarks: 'Madar site use USE-ABC1234',
      items: [{ item_code: 'POT-30', qty: 5, s_warehouse: SITE, project: 'PROJ-0001' }],
    });
    expect((postCalls[0].body['doc'] as { items: object[] }).items[0]).not.toHaveProperty(
      't_warehouse',
    );
  });

  it('returns unused stock as a transfer from the site to the warehouse', async () => {
    const { postCalls } = posting();
    await api().post(
      request({ reference: 'RET-ABC1234', to: 'Main warehouse - RN', qty: 2 }),
      null,
    );
    expect(postCalls[0].body['doc']).toMatchObject({
      stock_entry_type: 'Material Transfer',
      to_warehouse: 'Main warehouse - RN',
      remarks: 'Madar site return RET-ABC1234',
      items: [{ qty: 2, s_warehouse: SITE, t_warehouse: 'Main warehouse - RN' }],
    });
  });

  it('takes a remembered posted draft as the result only when it matches', async () => {
    const posted = {
      name: 'STE-1',
      docstatus: 1,
      items: [{ item_code: 'POT-30', qty: 5, s_warehouse: SITE, t_warehouse: null }],
    };
    const { postCalls } = fakeErpnext({}, {}, { 'Stock Entry/STE-1': posted });
    expect(await api().post(request(), 'STE-1')).toBe('STE-1');
    expect(postCalls).toEqual([]);
    await expect(
      api().post(request({ to: 'Main warehouse - RN' }), 'STE-1'),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });
});

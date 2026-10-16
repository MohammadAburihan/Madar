import { realTranslator } from '../../../../testing/real-translator';
import { ProjectDetail, SiteBalance } from '../data-access/project.models';
import * as view from './workspace-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const BALANCE: SiteBalance = {
  item: 'POT-30',
  itemName: 'Ceramic planters',
  uom: 'Unit',
  site: 'Project sites - RN',
  delivered: 8,
  consumed: 5,
  returned: 2,
  returnedTo: { 'Main warehouse - RN': 2 },
  atSite: 1,
  pendingOrders: [{ name: 'PO-2049', qty: 4 }],
  warehouses: [
    { warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 2 },
    { warehouse: 'Garden shop - RN', name: 'Garden shop', qty: 6 },
  ],
  returnTo: 'Main warehouse - RN',
};

describe('workspace view', () => {
  it('heads the workspace with the customer, project and status', () => {
    const project = {
      name: 'PRJ-018',
      kind: 'customer',
      customerName: 'Lina Haddad',
      status: 'open',
    } as ProjectDetail;
    expect(visible(view.workspaceSubtitle(project, en))).toBe(
      'Lina Haddad · PRJ-018 · In progress',
    );
    expect(
      visible(view.workspaceSubtitle({ ...project, kind: 'internal', customerName: null }, en)),
    ).toBe('Internal project · PRJ-018 · In progress');
  });

  it('lists tasks with their due date, owner and status', () => {
    const rows = view.taskRows(
      [{ subject: 'Install 12 planters', due: '2026-10-14', owners: ['Yara'], status: 'Working' }],
      'en',
      en,
    );
    expect(visible(rows)).toEqual([
      { id: '0', cells: ['Install 12 planters', '14 Oct · Yara', 'In progress'] },
    ]);
    expect(
      visible(view.taskRows([{ subject: 'X', due: null, owners: [], status: 'Open' }], 'ar', ar))[0]
        .cells[2],
    ).toBe('مفتوحة');
  });

  it('lays out the material ledger like the workspace mock', () => {
    expect(visible(view.ledgerTitle(BALANCE, 12, en))).toBe(
      'Ceramic planters · POT-30 · 12 required',
    );
    expect(visible(view.ledgerTitle(BALANCE, null, en))).toBe('Ceramic planters · POT-30');
    expect(visible(view.ledgerRows(BALANCE, en)).map((r) => r.cells)).toEqual([
      ['In your warehouses', '8', 'Available'],
      ['Transfer to site', '+8', 'Posted'],
      ['Consumed on site', '−5', 'Used'],
      ['Returned from site', '−2', 'Posted'],
      ['Remaining at site', '1', 'Available'],
      ['PO-2049 shortfall', '+4', 'Pending receipt'],
    ]);
  });

  it('snapshots the site stock and points at the next receipt', () => {
    expect(visible(view.siteSnapshot(BALANCE, en))).toEqual({
      heading: 'Ceramic planters · 1 at site · 5 used',
      rows: [
        { label: 'Delivered', value: '8 units' },
        { label: 'Consumed', value: '5 units' },
        { label: 'Returned', value: '2 units' },
        { label: 'At site now', value: '1 unit', accent: true },
        { label: 'Main warehouse', value: '2 units' },
      ],
    });
    expect(visible(view.nextHint([BALANCE], en))?.title).toBe('Next: receive 4 units');
    expect(view.nextHint([{ ...BALANCE, pendingOrders: [] }], en)).toBeNull();
  });

  it('links the records that have a page', () => {
    const links = view.recordLinks(
      [
        { kind: 'sale', name: 'S-042', detail: 'Paid', amount: 500 },
        { kind: 'expense', name: 'EX-019', detail: '', amount: 1320 },
      ],
      (r) => r.kind === 'sale',
      en,
    );
    expect(visible(links)).toEqual([
      { id: 'sale:S-042', label: 'Sale · S-042', openable: true },
      { id: 'expense:EX-019', label: 'Expense · EX-019', openable: false },
    ]);
  });
});

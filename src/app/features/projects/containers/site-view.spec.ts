import { realTranslator } from '../../../../testing/real-translator';
import { SiteBalance } from '../data-access/project.models';
import * as view from './site-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const BALANCE: SiteBalance = {
  item: 'POT-30',
  itemName: 'Ceramic planter',
  uom: 'Unit',
  site: 'Project sites - RN',
  delivered: 8,
  consumed: 0,
  returned: 0,
  atSite: 8,
  pendingOrders: [{ name: 'PO-2049', qty: 4 }],
  warehouses: [{ warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 0 }],
  returnTo: 'Main warehouse - RN',
};
const MAIN = BALANCE.warehouses[0];

describe('site view', () => {
  it('lays out the materials-at-site mock', () => {
    expect(visible(view.siteChip(BALANCE, en))).toBe('8 delivered · 0 used');
    expect(visible(view.siteRows(BALANCE, en))).toEqual([
      { label: 'Delivered to site', value: '8 units' },
      { label: 'Consumed', value: '0 units' },
      { label: 'Available at site', value: '8 units', accent: true },
      { label: 'PO-2049 purchase shortfall', value: '4 pending receipt', text: true },
    ]);
    expect(visible(view.useRows(BALANCE, 5, en))).toEqual([
      { label: 'At site before', value: '8 units' },
      { label: 'After confirming use', value: '3 at site · 5 consumed', accent: true, text: true },
    ]);
    expect(visible(view.useAdvice(BALANCE, 5, en))).toEqual({
      title: 'Usage changes the site balance',
      message: 'Confirm records 5 consumed. Site stock falls from 8 to 3; purchase stays open.',
    });
    expect(visible(view.useAdvice(BALANCE, 5, ar)).message).toBe(
      'يسجل التأكيد استهلاك 5. ينخفض مخزون الموقع من 8 إلى 3، ويبقى الشراء مفتوحاً.',
    );
  });

  it('lays out the usage-recorded mock', () => {
    const after = { ...BALANCE, consumed: 5, atSite: 3 };
    expect(visible(view.usedChip(after, en))).toBe('5 used · 3 at site');
    expect(visible(view.returnRows(after, MAIN, 2, en))).toEqual([
      { label: 'Site balance after return', value: '3 → 1' },
      { label: 'Main warehouse after return', value: '0 → 2' },
    ]);
    expect(visible(view.returnAdvice(after, MAIN, 2, en))).toEqual({
      title: 'Return only unused stock',
      message: 'Confirm moves 2 units back to Main warehouse. The 5 consumed stay recorded.',
    });
    expect(visible(view.pendingNotes(after, en))).toEqual([
      'PO-2049 still has 4 units pending receipt.',
    ]);
  });

  it('lays out the return-posted mock', () => {
    const after = { ...BALANCE, consumed: 5, returned: 2, atSite: 1 };
    const v = visible(view.returnedView(after, { name: 'Main warehouse', qty: 2 }, 2, en));
    expect(v.chip).toBe('2 returned · Confirmed');
    expect(v.card.message).toBe('The return is posted. Still at the site: 1 unit.');
    expect(v.rows.map((r) => [r.label, r.value])).toEqual([
      ['Delivered to site', '8 units'],
      ['Consumed', '5 units'],
      ['Returned to Main warehouse', '2 units'],
      ['Remaining at site', '1 unit'],
      ['Main warehouse stock', '2 units'],
    ]);
    expect(v.pending?.title).toBe('PO-2049 · 4 units · pending receipt');
    const empty = visible(
      view.returnedView({ ...after, atSite: 0 }, { name: 'Main warehouse', qty: 2 }, 2, ar),
    );
    expect(empty.card.message).toBe('تم ترحيل الإرجاع. لم يبقَ شيء في الموقع.');
    expect(visible(view.returnedView(after, { name: 'Main warehouse', qty: 2 }, 2, ar)).chip).toBe(
      'تم إرجاع 2 · مؤكد',
    );
  });
});

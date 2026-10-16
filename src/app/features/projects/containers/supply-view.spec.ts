import { realTranslator } from '../../../../testing/real-translator';
import { SupplyPlan } from '../data-access/project.models';
import * as view from './supply-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const PLAN: SupplyPlan = {
  item: 'POT-30',
  itemName: 'Ceramic planter · 30 cm',
  uom: 'Unit',
  site: 'Project sites - RN',
  need: 12,
  requestRows: [{ request: 'MR-1', row: 'r1', open: 12 }],
  atSite: 0,
  sources: [{ warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 8 }],
  pendingOrders: [],
};
const MAIN = PLAN.sources[0];

describe('supply view', () => {
  it('lays out the plan like the materials-and-supply mock', () => {
    expect(visible(view.planRows(PLAN, MAIN, 4, en))).toEqual([
      { label: 'Project requirement', value: '12 units' },
      { label: 'Main warehouse stock', value: '8 available' },
      { label: 'Shortfall to buy', value: '4 units', accent: true },
    ]);
    expect(visible(view.supplyAdvice(8, 4, 0, en))).toEqual({
      tone: 'warning',
      title: 'Supply in two parts',
      message: 'Move 8 now. Buy 4 more; ordered units stay pending until received.',
    });
    expect(visible(view.supplyAdvice(8, 0, 0, en)).title).toBe('Supply now');
    expect(visible(view.supplyAdvice(8, 0, 3, en))).toEqual({
      tone: 'tint',
      title: 'Send the rest in another delivery',
      message: 'Move 8 now. 3 more are still in stock; send them in another delivery.',
    });
    expect(visible(view.supplyAdvice(8, 1, 3, ar)).message).toBe(
      'انقل 8 الآن و3 من المخزون في توريد آخر، واشترِ 1 إضافية. تظل الوحدات المطلوبة معلّقة حتى استلامها.',
    );
    expect(visible(view.planRows(PLAN, MAIN, 4, ar))[0]).toEqual({
      label: 'متطلبات المشروع',
      value: '12 وحدة',
    });
  });

  it('adds what is already at site and on order', () => {
    const plan = { ...PLAN, atSite: 3, pendingOrders: [{ name: 'PO-2049', qty: 4 }] };
    expect(visible(view.planRows(plan, MAIN, 0, en)).map((r) => r.label)).toEqual([
      'Project requirement',
      'Main warehouse stock',
      'Already at site',
      'On order',
      'Shortfall to buy',
    ]);
    expect(visible(view.pendingCards(plan, en))).toEqual([
      {
        title: 'PO-2049 · 4 units · pending receipt',
        message: 'Ordered units do not count as available stock yet.',
      },
    ]);
  });

  it('shows the movement like the review-site-delivery mock', () => {
    expect(visible(view.reviewRows(PLAN, MAIN, 8, 4, en))).toEqual([
      { label: 'Main warehouse', value: '8 → 0' },
      { label: 'Project site', value: '0 → 8' },
      { label: 'Required', value: '12 · 4 still to buy', accent: true },
    ]);
    expect(visible(view.reviewRows(PLAN, MAIN, 8, 0, en))[2].value).toBe('12 · covered');
  });
});

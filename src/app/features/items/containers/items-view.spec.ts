import { realTranslator } from '../../../../testing/real-translator';
import { CatalogItem, ItemDetail } from '../data-access/items.models';
import { catalogCard, catalogRow, itemView } from './items-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const OLIVE: CatalogItem = {
  code: 'OLV-20',
  name: 'Olive tree · 20 L',
  group: 'Plants',
  uom: 'each',
  kind: 'product',
  price: 85,
  onHand: 24,
};
const CONSULT: CatalogItem = {
  code: 'SRV-GARDEN',
  name: 'Garden consultation',
  group: 'Services',
  uom: 'visit',
  kind: 'service',
  price: 150,
  onHand: null,
};

describe('items view', () => {
  it('shows catalog cards like the mock', () => {
    expect(visible(catalogCard(OLIVE, 'ILS', en))).toEqual({
      id: 'OLV-20',
      title: 'Olive tree · 20 L',
      meta: 'OLV-20 · Plants · each',
      detail: 'ILS 85.00 · 24 available',
      kind: 'product',
    });
    expect(visible(catalogCard(CONSULT, 'ILS', en)).detail).toBe('ILS 150.00 · No stock tracking');
    expect(visible(catalogCard({ ...OLIVE, price: null }, 'ILS', ar)).detail).toBe('المتاح 24');
  });

  it('shows table rows like the desktop mock', () => {
    expect(visible(catalogRow(CONSULT, 'ILS', en)).cells).toEqual([
      'Garden consultation · SRV-GARDEN',
      'Service · Services',
      'ILS 150.00',
    ]);
    expect(catalogRow({ ...OLIVE, price: null }, 'ILS', en).cells[2]).toBe('—');
  });

  it('shows the item page with cost only for roles that see costs', () => {
    const detail: ItemDetail = {
      ...OLIVE,
      barcode: '7290000123456',
      cost: 42,
      modified: 'M',
      stock: [
        { warehouse: 'Main warehouse', qty: 24 },
        { warehouse: 'Work In Progress', qty: 0 },
      ],
    };
    const view = visible(itemView(detail, 'ILS', true, en));
    expect(view.subtitle).toBe('OLV-20 · Plants');
    expect(view.prices).toEqual([
      { label: 'Selling price', value: 'ILS 85.00 / each', text: false },
      { label: 'Buying cost', value: 'ILS 42.00' },
    ]);
    expect(view.stock).toEqual([{ title: '24 available', message: 'Main warehouse' }]);
    expect(view.noStock).toBe(false);
    expect(
      itemView({ ...detail, stock: [{ warehouse: 'Main warehouse', qty: 0 }] }, 'ILS', true, en)
        .noStock,
    ).toBe(true);
    expect(view.lines).toBe('Barcode 7290000123456\nUnit: each');
    expect(itemView(detail, 'ILS', false, en).prices).toHaveLength(1);
    const service = visible(
      itemView({ ...CONSULT, barcode: '', cost: 0, stock: null, modified: 'M' }, 'ILS', true, en),
    );
    expect(service.subtitle).toBe('SRV-GARDEN · Service · Services');
    expect(service.prices).toHaveLength(1);
    expect(service.stockUnread).toBe(false);
  });
});

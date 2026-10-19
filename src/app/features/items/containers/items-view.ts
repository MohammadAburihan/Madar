import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { CatalogItem, ItemDetail } from '../data-access/items.models';

const num = (qty: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(qty);

/** "ILS 85.00 · 24 available", "ILS 150.00 · No stock tracking": the price where readable, then the stock. */
function priceAndStock(item: CatalogItem, currency: string, tr: Translator): string {
  const stock =
    item.kind === 'service'
      ? tr.t('items.noStock')
      : item.onHand === null
        ? null
        : tr.t('items.available', { qty: num(item.onHand) });
  return [item.price === null ? null : formatMoney(item.price, currency), stock]
    .filter(Boolean)
    .join(' · ');
}

export function catalogCard(item: CatalogItem, currency: string, tr: Translator) {
  return {
    id: item.code,
    title: item.name,
    meta: `${item.code} · ${item.group} · ${item.uom}`,
    detail: priceAndStock(item, currency, tr) || null,
    kind: item.kind,
  };
}

/** The desktop table: name and code, kind and category, price. */
export function catalogRow(item: CatalogItem, currency: string, tr: Translator): TableRow {
  return {
    id: item.code,
    cells: [
      `${item.name} · ${item.code}`,
      `${tr.t(`items.kinds.${item.kind}`)} · ${item.group}`,
      item.price === null ? '—' : formatMoney(item.price, currency),
    ],
  };
}

/** An item's page: what it costs to buy and sell, and where its stock is. */
export function itemView(detail: ItemDetail, currency: string, seeCosts: boolean, tr: Translator) {
  const prices: TotalRow[] = [
    {
      label: tr.t('items.sellingPrice'),
      value:
        detail.price === null
          ? tr.t('items.noPrice')
          : tr.t('items.perUnit', { price: formatMoney(detail.price, currency), uom: detail.uom }),
      text: detail.price === null,
    },
    ...(seeCosts && detail.kind === 'product'
      ? [{ label: tr.t('items.cost'), value: formatMoney(detail.cost, currency) }]
      : []),
  ];
  return {
    title: detail.name,
    subtitle:
      detail.kind === 'service'
        ? `${detail.code} · ${tr.t('items.kinds.service')} · ${detail.group}`
        : `${detail.code} · ${detail.group}`,
    prices,
    // Locations holding none of it aren't listed: a business has setup warehouses it never uses.
    stock: (detail.stock ?? [])
      .filter((s) => s.qty !== 0)
      .map((s) => ({
        title: tr.t('items.available', { qty: num(s.qty) }),
        message: s.warehouse,
      })),
    stockUnread: detail.kind === 'product' && detail.stock === null,
    noStock: detail.kind === 'product' && !!detail.stock && detail.stock.every((s) => s.qty === 0),
    lines: [
      detail.barcode ? tr.t('items.barcodeLine', { barcode: detail.barcode }) : null,
      tr.t('items.unitLine', { uom: detail.uom }),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

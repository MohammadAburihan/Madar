import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  LinkedRecord,
  ProjectDetail,
  ProjectTask,
  SiteBalance,
} from '../data-access/project.models';
import { taskCard } from './project-view';
import { qty, supplyUnits } from './supply-view';

const TASK_STATUSES = ['Open', 'Working', 'Pending Review', 'Overdue', 'Completed', 'Cancelled'];
const signed = (value: number, sign: '+' | '−') => `${sign}${qty(value)}`;

/** "Lina Haddad · PRJ-018 · In progress", as on the desktop workspace mock. */
export function workspaceSubtitle(project: ProjectDetail, tr: Translator): string {
  const status = tr.t(`project.status.${project.status}`);
  return project.kind === 'customer'
    ? [project.customerName ?? tr.t('project.noCustomer'), project.name, status].join(' · ')
    : `${tr.t('project.overview.internalSubtitle', { name: project.name })} · ${status}`;
}

/** Task · Due and owner · Status. */
export function taskRows(
  tasks: readonly ProjectTask[],
  language: Language,
  tr: Translator,
): TableRow[] {
  return tasks.map((task, i) => ({
    id: String(i),
    cells: [
      task.subject,
      taskCard(task, language, tr).message,
      TASK_STATUSES.includes(task.status)
        ? tr.t(`project.workspace.taskStatus.${task.status.replace(' ', '')}`)
        : task.status,
    ],
  }));
}

/** "Ceramic planters · POT-30 · 12 required", or without the requirement once it is all delivered. */
export function ledgerTitle(balance: SiteBalance, required: number | null, tr: Translator): string {
  return required
    ? tr.t('project.workspace.ledgerTitle', {
        item: balance.itemName,
        code: balance.item,
        required: qty(required),
      })
    : tr.t('project.overview.requirementLine', { item: balance.itemName, code: balance.item });
}

/** The item's movements for the project: stock on hand, to site, used, returned, left, and on order. */
export function ledgerRows(balance: SiteBalance, tr: Translator): TableRow[] {
  const t = (key: string, params?: Record<string, unknown>) =>
    tr.t(`project.workspace.ledger.${key}`, params);
  const inStock = balance.warehouses.reduce((sum, w) => sum + w.qty, 0);
  const rows: TableRow[] = [{ id: 'stock', cells: [t('stock'), qty(inStock), t('available')] }];
  if (balance.delivered) {
    rows.push({
      id: 'delivered',
      cells: [t('delivered'), signed(balance.delivered, '+'), t('posted')],
    });
  }
  if (balance.consumed) {
    rows.push({ id: 'consumed', cells: [t('consumed'), signed(balance.consumed, '−'), t('used')] });
  }
  if (balance.returned) {
    rows.push({
      id: 'returned',
      cells: [t('returned'), signed(balance.returned, '+'), t('posted')],
    });
  }
  rows.push({ id: 'site', cells: [t('atSite'), qty(balance.atSite), t('available')] });
  for (const order of balance.pendingOrders) {
    rows.push({
      id: `order-${order.name}`,
      cells: [t('shortfall', { order: order.name }), signed(order.qty, '+'), t('pending')],
    });
  }
  return rows;
}

/** The site stock snapshot: "1 at site · 5 used", then delivered, used, returned, left and the main warehouse. */
export function siteSnapshot(balance: SiteBalance, tr: Translator) {
  const main = balance.warehouses.find((w) => w.warehouse === balance.returnTo) ?? null;
  const rows: TotalRow[] = [
    { label: tr.t('project.site.returnRows.delivered'), value: supplyUnits(balance.delivered, tr) },
    { label: tr.t('project.site.rows.consumed'), value: supplyUnits(balance.consumed, tr) },
    { label: tr.t('project.workspace.returned'), value: supplyUnits(balance.returned, tr) },
    {
      label: tr.t('project.workspace.atSiteNow'),
      value: supplyUnits(balance.atSite, tr),
      accent: true,
    },
  ];
  if (main) {
    rows.push({ label: main.name, value: supplyUnits(main.qty, tr) });
  }
  return {
    heading: tr.t('project.workspace.snapshot', {
      item: balance.itemName,
      left: qty(balance.atSite),
      used: qty(balance.consumed),
    }),
    rows,
  };
}

export interface RecordLink {
  id: string;
  label: string;
  /** Madar has a page for it that this role may open. */
  openable: boolean;
}

/** "Sale · S-042" per linked record; sales invoices and purchase orders open their page. */
export function recordLinks(
  linked: readonly LinkedRecord[],
  canOpen: (record: LinkedRecord) => boolean,
  tr: Translator,
): RecordLink[] {
  return linked.map((record) => ({
    id: `${record.kind}:${record.name}`,
    label: tr.t('project.workspace.record', {
      kind: tr.t(`project.overview.kinds.${record.kind}`),
      name: record.name,
    }),
    openable: canOpen(record),
  }));
}

/** "Next: receive 4 units" while an order booked to the project is still to arrive. */
export function nextHint(balances: readonly SiteBalance[], tr: Translator) {
  for (const balance of balances) {
    const [order] = balance.pendingOrders;
    if (order) {
      const units = supplyUnits(order.qty, tr);
      return {
        title: tr.t('project.workspace.next.title', { units }),
        message: tr.t('project.workspace.next.message', { order: order.name, units }),
      };
    }
  }
  return null;
}

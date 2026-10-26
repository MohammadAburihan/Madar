import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { ProjectDetail, ProjectSale, ProjectSales } from '../data-access/project.models';
import { RecordLinkItem } from '../components/record-links.component';

export interface SellSection {
  state: 'sell' | 'disabled' | 'internal';
  heading: string;
  note: string | null;
  quick: string | null;
  notice: { title: string; message: string } | null;
  supply: string | null;
  addCustomer: string | null;
}

export interface SellAccess {
  sell: boolean;
  supplyProjects: boolean;
  manageProjects: boolean;
}

/** The "Sell to this project" card: buttons for an enabled customer, the disabled warning, or the internal notice. */
export function sellSection(
  project: ProjectDetail,
  access: SellAccess,
  tr: Translator,
): SellSection | null {
  if (!access.sell || project.status === 'cancelled') {
    return null;
  }
  const { t } = tr;
  const base = {
    heading: t('project.sell.title'),
    note: null,
    quick: null,
    notice: null,
    supply: null,
    addCustomer: null,
  };
  if (project.kind === 'internal' || !project.customer) {
    return {
      ...base,
      state: 'internal',
      notice: {
        title: t('project.sell.internal.title'),
        message: t('project.sell.internal.message'),
      },
      supply: access.supplyProjects ? t('project.sell.internal.supply') : null,
      addCustomer: access.manageProjects ? t('project.sell.internal.addCustomer') : null,
    };
  }
  if (project.customerActive === false) {
    return {
      ...base,
      state: 'disabled',
      notice: {
        title: t('project.sell.disabled.title'),
        message: t('project.sell.disabled.message'),
      },
    };
  }
  return {
    ...base,
    state: 'sell',
    note: t('project.sell.note', { customer: project.customerName ?? project.customer }),
    quick: t('project.sell.quick'),
  };
}

function statusText(sale: ProjectSale, tr: Translator): string {
  const { t } = tr;
  const status = sale.status;
  if (sale.kind === 'invoice') {
    if (sale.isReturn) {
      return t('project.sell.status.return');
    }
    if (status === 'Paid') {
      return t('project.sell.status.paid');
    }
    if (status === 'Credit Note Issued') {
      return t('project.sell.status.creditNote');
    }
    if (status.startsWith('Partly Paid')) {
      return t('project.sell.status.partlyPaid');
    }
    if (status.startsWith('Unpaid') || status.startsWith('Overdue')) {
      return t('project.sell.status.unpaid');
    }
    return status;
  }
  const orders: Record<string, string> = {
    'To Deliver and Bill': 'toDeliverAndBill',
    'To Deliver': 'toDeliver',
    'To Bill': 'toBill',
    Completed: 'completed',
    Closed: 'closed',
    'On Hold': 'onHold',
  };
  return orders[status] ? t(`project.sell.status.${orders[status]}`) : status;
}

/** "SI-1042 · ILS 320.00 · Paid" per sale, newest first; each opens its record page. */
export function saleLinks(sales: ProjectSales, currency: string, tr: Translator): RecordLinkItem[] {
  return sales.rows.map((sale) => ({
    id: `${sale.kind}:${sale.name}`,
    label: tr.t('project.sell.row', {
      name: sale.name,
      amount: formatMoney(sale.amount, currency),
      status: statusText(sale, tr),
    }),
    openable: true,
  }));
}

export function billedText(sales: ProjectSales, currency: string, tr: Translator): string | null {
  return sales.billed === null
    ? null
    : tr.t('project.sell.billed', { amount: formatMoney(sales.billed, currency) });
}

/** What the capped sales list leaves out, so the rest isn't mistaken for nothing. */
export function moreSalesText(sales: ProjectSales, tr: Translator): string[] {
  return [
    ...(sales.moreInvoices > 0 ? [tr.plural('project.sell.moreInvoices', sales.moreInvoices)] : []),
    ...(sales.moreOrders > 0 ? [tr.plural('project.sell.moreOrders', sales.moreOrders)] : []),
  ];
}

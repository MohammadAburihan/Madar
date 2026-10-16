import { Capabilities } from '../../../core/auth/capabilities';
import { Translator } from '../../../core/i18n/translator';
import { ContactKind, CustomerDetail, SupplierDetail } from '../data-access/contacts.models';

/** Which lists the role works with: customers for selling or projects, suppliers for buying or receiving. */
export function contactKinds(caps: Capabilities): ContactKind[] {
  return [
    ...(caps.sell || caps.collect || caps.manageProjects ? (['customers'] as const) : []),
    ...(caps.orderPurchases || caps.receiveGoods || caps.recordSupplierInvoices || caps.paySuppliers
      ? (['suppliers'] as const)
      : []),
  ];
}

export interface ContactAction {
  id: string;
  label: string;
  route: string[];
  query: Record<string, string>;
}

/** The tasks a contact's page offers, each opening with the contact already chosen. */
export function contactActions(
  kind: ContactKind,
  detail: CustomerDetail | SupplierDetail,
  caps: Capabilities,
  tr: Translator,
): ContactAction[] {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`contacts.${key}`, params);
  if (kind === 'customers') {
    const owes = 'totals' in detail && (detail.totals?.outstanding ?? 0) > 0.005;
    return [
      ...(caps.collect && owes
        ? [
            {
              id: 'collect',
              label: t('receivePayment'),
              route: ['/money/receive'],
              query: { customer: detail.id },
            },
          ]
        : []),
      ...(caps.sell
        ? [
            {
              id: 'sell',
              // The design addresses the customer by first name: "Sell to Lina".
              label: t('sellTo', { name: detail.name.split(/\s+/)[0] }),
              route: ['/sales/new'],
              query: { customer: detail.id },
            },
          ]
        : []),
    ];
  }
  const unpaid = 'unpaid' in detail ? detail.unpaid : null;
  return [
    ...(caps.orderPurchases
      ? [
          {
            id: 'buy',
            label: t('buyFrom', { name: detail.name }),
            route: ['/purchases/new'],
            query: { supplier: detail.id },
          },
        ]
      : []),
    ...(caps.paySuppliers && unpaid
      ? [
          {
            id: 'pay',
            label: t('paySupplier'),
            route: ['/purchases/invoice', unpaid.name, 'pay'],
            query: {},
          },
        ]
      : []),
  ];
}

/** The kinds the role may add, or edit (ERPNext lets more roles edit suppliers than create them). */
export function editableKinds(caps: Capabilities, action: 'add' | 'edit'): ContactKind[] {
  return [
    ...(caps.editCustomers ? (['customers'] as const) : []),
    ...((action === 'add' ? caps.addSuppliers : caps.editSuppliers)
      ? (['suppliers'] as const)
      : []),
  ];
}

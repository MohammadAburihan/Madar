import { Capabilities } from '../../../core/auth/capabilities';
import { Translator } from '../../../core/i18n/translator';

export interface NewAction {
  id: string;
  label: string;
  route: string[];
}

/** Everything the "+ New" menu can start, each with who may start it and where it starts. */
const ACTIONS: { id: string; allowed: (caps: Capabilities) => boolean; route: string[] }[] = [
  { id: 'sell', allowed: (c) => c.sell, route: ['/sales/new'] },
  { id: 'quote', allowed: (c) => c.sell, route: ['/sales/quote/new'] },
  { id: 'buy', allowed: (c) => c.orderPurchases, route: ['/purchases/new'] },
  { id: 'receivePayment', allowed: (c) => c.collect, route: ['/money/receive'] },
  // Paying and receiving start from the order or invoice they belong to.
  { id: 'paySupplier', allowed: (c) => c.paySuppliers, route: ['/purchases'] },
  { id: 'receiveGoods', allowed: (c) => c.receiveGoods, route: ['/purchases'] },
  { id: 'recordExpense', allowed: (c) => c.recordExpenses, route: ['/money/expense'] },
  { id: 'transferStock', allowed: (c) => c.transferStock, route: ['/inventory/transfer'] },
  { id: 'supplyProject', allowed: (c) => c.supplyProjects, route: ['/projects'] },
  { id: 'newProject', allowed: (c) => c.manageProjects, route: ['/projects/new'] },
  {
    id: 'addContact',
    allowed: (c) => c.editCustomers || c.addSuppliers,
    route: ['/contacts/new'],
  },
  { id: 'addWorker', allowed: (c) => c.manageWorkers, route: ['/workers/new'] },
  { id: 'markAttendance', allowed: (c) => c.manageWorkers, route: ['/workers/attendance'] },
];

/** "Create something": only what the user's role may start (docs/PERMISSIONS.md), as on the New action menu. */
export function newActions(caps: Capabilities, tr: Translator): NewAction[] {
  return ACTIONS.filter((a) => a.allowed(caps)).map((a) => ({
    id: a.id,
    label: tr.t(`newMenu.actions.${a.id}`),
    route: a.route,
  }));
}

import { Capabilities } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { daysUntil, formatLongDate, formatMoney } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { Draft, HomeData } from '../data-access/home.models';
import { DraftKind } from '../data-access/drafts.models';
import { DraftTarget, draftAction, draftTarget } from './drafts-view';
import { ago as relativeAgo } from './relative-time';

export interface HomeViewInput {
  data: HomeData;
  persona: Persona;
  /** Hides quick actions the user's ERPNext roles can't perform. */
  capabilities?: Partial<
    Pick<
      Capabilities,
      | 'transferStock'
      | 'orderPurchases'
      | 'receiveGoods'
      | 'paySuppliers'
      | 'recordExpenses'
      | 'supplyProjects'
    >
  >;
  firstName: string;
  business: { name: string; currency: string };
  language: Language;
  now: Date;
}

export interface ActionView {
  id: string;
  label: string;
}

export interface CardView {
  title: string;
  message: string;
  /** Amount titles read as an isolated left-to-right run, also in Arabic. */
  numeric?: boolean;
  /** Where the card's button goes, when it has one. */
  target?: DraftTarget;
  action?: string;
}

export interface AttentionRow {
  work: string;
  due: string;
  next: string;
  /** Set when `next` is a button that opens a draft. */
  target?: DraftTarget;
}

export interface HomeView {
  title: string;
  subtitle: string;
  desktopSubtitle: string;
  roleLabel: string;
  actions: ActionView[];
  actionColumns: 2 | 3;
  cards: CardView[];
  rows: AttentionRow[];
  emptyAttention: CardView;
  summary: string | null;
  glance: CardView[];
  glanceNote: string;
  note: string | null;
  draftsLink: string | null;
}

// Every quick action uses the secondary button style in the mocks, whatever the persona.
const ACTIONS: Record<Persona, string[]> = {
  owner: [
    'sell',
    'buy',
    'receivePayment',
    'paySupplier',
    'recordExpense',
    'transferStock',
    'supplyProject',
    'assistant',
  ],
  salesperson: ['sell', 'receivePayment', 'customers', 'catalog', 'assistant'],
  storeAssociate: ['sell', 'receivePayment', 'receiveGoods', 'transferStock', 'assistant'],
  warehouse: ['receiveGoods', 'transferStock', 'countStock', 'supplyProjectShort', 'assistant'],
  purchasing: ['buy', 'receiveGoods', 'assistant'],
  projectManager: ['supplyProject', 'assistant'],
};

const KINDS: Record<Draft['doctype'], DraftKind> = {
  'Sales Invoice': 'sale',
  'Sales Order': 'order',
  Quotation: 'quotation',
};

const MOBILE_CARD_LIMIT = 2;
const TABLE_ROW_LIMIT = 5;

export function buildHomeView(input: HomeViewInput, tr: Translator): HomeView {
  const { data, persona, business, language, now } = input;
  const money = (amount: number, decimals: 0 | 2 = 2) =>
    formatMoney(amount, business.currency, decimals);
  const dueKey = (iso: string) => {
    const days = daysUntil(iso, now);
    return days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'later';
  };
  const dueLabel = (iso: string) => {
    const key = dueKey(iso);
    return key === 'later' ? iso : tr.t(`home.due.${key}`);
  };
  const ago = (timestamp: string) => relativeAgo(timestamp, now, tr);

  const roleLabel = tr.t(`home.role.${persona}`);
  const date = formatLongDate(now, language);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const title =
    persona === 'owner'
      ? tr.t(`home.greeting.${greeting}`, { name: input.firstName })
      : tr.t(`home.title.${persona}`);

  const draftCount = data.drafts?.count ?? 0;
  const drafts = data.drafts?.recent ?? [];
  const deliveries = data.deliveries ?? [];
  const invoices = data.invoicesDue ?? [];
  const supply = data.supply ?? [];
  const lowStock = data.lowStock;

  const draftsCard: CardView | null = drafts.length
    ? {
        title: tr.plural('home.cards.drafts', draftCount),
        message: tr.t('home.cards.draftsMessage', {
          party: drafts[0].party,
          when: ago(drafts[0].modified),
        }),
        target: { commands: ['/drafts'], draft: null },
        action: tr.t('home.cards.viewDrafts'),
      }
    : null;
  const deliveryCards: CardView[] = deliveries.map((d) => ({
    title: tr.t(
      `home.cards.delivery.${dueKey(d.scheduleDate) === 'later' ? 'tomorrow' : dueKey(d.scheduleDate)}`,
    ),
    message: tr.t('home.cards.deliveryMessage', { po: d.name, qty: d.qty, item: d.itemName }),
  }));
  const paymentCards: CardView[] = invoices.map((i) => ({
    title: tr.t(
      `home.cards.payment.${dueKey(i.dueDate) === 'later' ? 'tomorrow' : dueKey(i.dueDate)}`,
    ),
    message: tr.t('home.cards.paymentMessage', { customer: i.customer, invoice: i.name }),
  }));
  const supplyCards: CardView[] = supply.map((s) => ({
    title: tr.t('home.cards.supplyNeed', { project: s.projectName }),
    message: tr.t('home.cards.supplyNeedMessage', {
      qty: s.qty,
      item: s.itemName,
      available: s.available,
    }),
  }));
  const lowStockCard: CardView | null =
    lowStock && lowStock.count > 0
      ? {
          title: tr.plural('home.cards.lowStock', lowStock.count),
          message: tr.t('home.cards.lowStockMessage', { warehouse: lowStock.warehouse ?? '' }),
        }
      : null;

  const own = drafts.find((d) => d.doctype === 'Sales Invoice');
  const ownTarget =
    own &&
    draftTarget({
      kind: KINDS[own.doctype],
      name: own.name,
      continuable: own.continuable,
      invoice: null,
    });
  const ownAction =
    own && draftAction({ kind: KINDS[own.doctype], continuable: own.continuable }, tr);
  const invoice = invoices[0];
  const continueSaleCard: CardView | null = own
    ? {
        title: tr.t('home.cards.continueSale'),
        message: tr.t('home.cards.continueSaleMessage', {
          party: own.party,
          amount: formatMoney(own.total, own.currency || business.currency),
        }),
        target: ownTarget,
        action: ownAction,
      }
    : null;
  const followUpCard: CardView | null = invoice
    ? {
        title: tr.t('home.cards.followUp'),
        message: tr.t(
          `home.cards.followUpMessage.${dueKey(invoice.dueDate) === 'later' ? 'tomorrow' : dueKey(invoice.dueDate)}`,
          { customer: invoice.customer },
        ),
      }
    : null;

  let cards: CardView[];
  if (persona === 'storeAssociate') {
    // Counter sales first, then the stock that keeps the counter going.
    cards = [continueSaleCard, lowStockCard, followUpCard, ...supplyCards].filter(
      (c): c is CardView => !!c,
    );
  } else if (persona === 'salesperson') {
    cards = [
      continueSaleCard,
      invoice && {
        title: tr.t('home.cards.followUp'),
        message: tr.t(
          `home.cards.followUpMessage.${dueKey(invoice.dueDate) === 'later' ? 'tomorrow' : dueKey(invoice.dueDate)}`,
          {
            customer: invoice.customer,
          },
        ),
      },
    ].filter((c): c is CardView => !!c);
  } else if (persona === 'warehouse') {
    cards = [lowStockCard, ...supplyCards, ...deliveryCards].filter((c): c is CardView => !!c);
  } else if (persona === 'purchasing') {
    cards = [...deliveryCards, lowStockCard].filter((c): c is CardView => !!c);
  } else if (persona === 'projectManager') {
    cards = [...supplyCards, lowStockCard].filter((c): c is CardView => !!c);
  } else {
    cards = [draftsCard, ...deliveryCards, ...paymentCards, ...supplyCards].filter(
      (c): c is CardView => !!c,
    );
  }

  const rows: (AttentionRow & { sort: string })[] = [
    ...deliveries.map((d) => ({
      work: `${tr.isolate(d.name)} · ${tr.isolate(d.supplier)}`,
      due: dueLabel(d.scheduleDate),
      next: tr.t('home.next.receiveDelivery'),
      sort: `1${d.scheduleDate}`,
    })),
    ...(own ? [own] : []).map((d) => ({
      work: tr.t('home.work.draft', { party: d.party }),
      due: ago(d.modified),
      next: draftAction({ kind: KINDS[d.doctype], continuable: d.continuable }, tr),
      target: draftTarget({
        kind: KINDS[d.doctype],
        name: d.name,
        continuable: d.continuable,
        invoice: null,
      }),
      sort: `2${d.modified}`,
    })),
    ...supply.map((s) => ({
      work: tr.isolate(s.projectName),
      due: dueLabel(s.scheduleDate),
      next: tr.t('home.next.supply', { qty: s.qty, item: s.itemName }),
      sort: `3${s.scheduleDate}`,
    })),
    ...invoices.map((i) => ({
      work: `${tr.isolate(i.customer)} · ${tr.isolate(i.name)}`,
      due: dueLabel(i.dueDate),
      next: tr.t('home.next.receivePayment'),
      sort: `4${i.dueDate}`,
    })),
  ];

  const summary =
    persona === 'owner'
      ? data.todaySales !== undefined && data.receivables !== undefined
        ? tr.t('home.summary.owner', {
            sales: money(data.todaySales, 0),
            collect: money(data.receivables, 0),
          })
        : null
      : persona === 'salesperson' || persona === 'storeAssociate'
        ? data.todaySales !== undefined
          ? tr.t('home.summary.salesperson', { sales: money(data.todaySales, 0) })
          : null
        : !lowStock
          ? null
          : lowStock.count === 0
            ? tr.t('home.glance.allStocked')
            : tr.plural('home.summary.warehouse', lowStock.count, {
                warehouse: lowStock.warehouse ?? '',
              });

  const glance: CardView[] = [];
  if (data.todaySales !== undefined) {
    glance.push({
      numeric: true,
      title: money(data.todaySales),
      message: tr.t(persona === 'owner' ? 'home.glance.sales' : 'home.glance.salesOwn'),
    });
  }
  if (data.receivables !== undefined) {
    glance.push({
      numeric: true,
      title: money(data.receivables),
      message: tr.t('home.glance.receivables'),
    });
  }
  if (lowStock) {
    glance.push(
      lowStock.count === 0
        ? { title: tr.t('home.glance.noLowStock'), message: tr.t('home.glance.allStocked') }
        : {
            title: tr.plural('home.glance.lowStock', lowStock.count),
            message: lowStock.warehouse ? tr.isolate(lowStock.warehouse) : '',
          },
    );
  }

  return {
    title,
    subtitle: `${roleLabel} · ${date}`,
    desktopSubtitle: `${tr.isolate(business.name)} · ${roleLabel} · ${date}`,
    roleLabel,
    actions: ACTIONS[persona]
      .filter(
        (id) =>
          (id !== 'transferStock' && id !== 'countStock') ||
          (input.capabilities?.transferStock ?? true),
      )
      .filter((id) => id !== 'buy' || (input.capabilities?.orderPurchases ?? true))
      .filter((id) => id !== 'receiveGoods' || (input.capabilities?.receiveGoods ?? true))
      .filter((id) => id !== 'paySupplier' || (input.capabilities?.paySuppliers ?? true))
      .filter((id) => id !== 'recordExpense' || (input.capabilities?.recordExpenses ?? true))
      .filter(
        (id) => !id.startsWith('supplyProject') || (input.capabilities?.supplyProjects ?? true),
      )
      .map((id) => ({ id, label: tr.t(`home.actions.${id}`) })),
    actionColumns: persona === 'owner' ? 3 : 2,
    cards: cards.slice(0, MOBILE_CARD_LIMIT),
    rows: rows
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .slice(0, TABLE_ROW_LIMIT)
      .map(({ sort, ...row }) => row),
    emptyAttention: { title: tr.t('home.allClear.title'), message: tr.t('home.allClear.message') },
    summary,
    glance,
    glanceNote: tr.t('home.glance.note', { business: business.name }),
    note: persona === 'warehouse' ? tr.t('home.warehouseNote') : null,
    draftsLink: draftCount
      ? tr.t('home.draftsLink', { drafts: tr.plural('home.draftCount', draftCount) })
      : null,
  };
}

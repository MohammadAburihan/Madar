import { Persona } from '../../../core/auth/persona';
import { daysUntil, formatLongDate, formatMoney, minutesSince } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { HomeData } from '../data-access/home.models';

export interface HomeViewInput {
  data: HomeData;
  persona: Persona;
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
}

export interface AttentionRow {
  work: string;
  due: string;
  next: string;
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
  ],
  salesperson: ['sell', 'receivePayment', 'customers', 'catalog'],
  warehouse: ['receiveGoods', 'transferStock', 'countStock', 'supplyProjectShort'],
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
  const ago = (timestamp: string) => {
    const minutes = minutesSince(timestamp, now);
    if (minutes < 1) {
      return tr.t('home.relative.justNow');
    }
    if (minutes < 60) {
      return tr.plural('home.relative.minutes', minutes);
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24
      ? tr.plural('home.relative.hours', hours)
      : tr.plural('home.relative.days', Math.floor(hours / 24));
  };

  const roleLabel = tr.t(`home.role.${persona}`);
  const date = formatLongDate(now, language);
  const title =
    persona === 'owner'
      ? tr.t(`home.greeting.${now.getHours() < 12 ? 'morning' : 'evening'}`, {
          name: input.firstName,
        })
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

  let cards: CardView[];
  if (persona === 'salesperson') {
    const own = drafts[0];
    const invoice = invoices[0];
    cards = [
      own && {
        title: tr.t('home.cards.continueSale'),
        message: tr.t('home.cards.continueSaleMessage', {
          party: own.party,
          amount: formatMoney(own.total, own.currency || business.currency),
        }),
      },
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
  } else {
    cards = [draftsCard, ...deliveryCards, ...paymentCards, ...supplyCards].filter(
      (c): c is CardView => !!c,
    );
  }

  const rows: (AttentionRow & { sort: string })[] = [
    ...deliveries.map((d) => ({
      work: `${d.name} · ${d.supplier}`,
      due: dueLabel(d.scheduleDate),
      next: tr.t('home.next.receiveDelivery'),
      sort: `1${d.scheduleDate}`,
    })),
    ...drafts.slice(0, 1).map((d) => ({
      work: tr.t('home.work.draft', { party: d.party }),
      due: ago(d.modified),
      next: tr.t('home.next.continueSale'),
      sort: `2${d.modified}`,
    })),
    ...supply.map((s) => ({
      work: s.projectName,
      due: dueLabel(s.scheduleDate),
      next: tr.t('home.next.supply', { qty: s.qty, item: s.itemName }),
      sort: `3${s.scheduleDate}`,
    })),
    ...invoices.map((i) => ({
      work: `${i.customer} · ${i.name}`,
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
      : persona === 'salesperson'
        ? data.todaySales !== undefined
          ? tr.t('home.summary.salesperson', { sales: money(data.todaySales, 0) })
          : null
        : lowStock
          ? tr.plural('home.summary.warehouse', lowStock.count, {
              warehouse: lowStock.warehouse ?? '',
            })
          : null;

  const glance: CardView[] = [];
  if (data.todaySales !== undefined) {
    glance.push({
      numeric: true,
      title: money(data.todaySales),
      message: tr.t(persona === 'salesperson' ? 'home.glance.salesOwn' : 'home.glance.sales'),
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
    glance.push({
      title: tr.plural('home.glance.lowStock', lowStock.count),
      message: lowStock.warehouse ?? tr.t('home.glance.allStocked'),
    });
  }

  return {
    title,
    subtitle: `${roleLabel} · ${date}`,
    desktopSubtitle: `${business.name} · ${roleLabel} · ${date}`,
    roleLabel,
    actions: ACTIONS[persona].map((id) => ({ id, label: tr.t(`home.actions.${id}`) })),
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
    draftsLink:
      persona !== 'warehouse' && draftCount
        ? tr.t('home.draftsLink', { drafts: tr.plural('home.draftCount', draftCount) })
        : null,
  };
}

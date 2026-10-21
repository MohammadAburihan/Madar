import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { DraftEntry, DraftKind } from '../data-access/drafts.models';
import { ago } from './relative-time';

export interface DraftCardView {
  id: string;
  title: string;
  meta: string;
  action: string;
  primary: boolean;
  /** Shows the Delete button; its label is `deleteLabel`. */
  deletable: boolean;
  deleteLabel: string;
}

export interface DraftsView {
  subtitle: string;
  cards: DraftCardView[];
  empty: { title: string; message: string };
  note: string;
}

export interface DraftsViewInput {
  entries: readonly DraftEntry[];
  term: string;
  business: string;
  currency: string;
  /** Totals of buying documents are for roles that see costs only. */
  seeCosts: boolean;
  now: Date;
}

const BUYING: readonly DraftKind[] = ['purchase', 'payment'];

export const draftId = (entry: Pick<DraftEntry, 'kind' | 'name'>) => `${entry.kind}:${entry.name}`;

/** The label of a draft's button: Continue where Madar can finish it, Open where it only shows the page. */
export const draftAction = (
  entry: Pick<DraftEntry, 'kind' | 'continuable'>,
  tr: Translator,
): string => tr.t(`drafts.${entry.continuable ? 'continue' : 'open'}.${entry.kind}`);

/** Where a draft's button goes: its task with `?draft=`, or its page when Madar can't finish it. */
export interface DraftTarget {
  commands: string[];
  draft: string | null;
}

export function draftTarget(
  entry: Pick<DraftEntry, 'kind' | 'name' | 'continuable' | 'invoice'>,
): DraftTarget {
  const { name } = entry;
  switch (entry.kind) {
    case 'sale':
      return entry.continuable
        ? { commands: ['/sales/new/basket'], draft: name }
        : { commands: ['/sales/invoices', name], draft: null };
    case 'quotation':
      return entry.continuable
        ? { commands: ['/sales/quote/new'], draft: name }
        : { commands: ['/sales/quotes', name], draft: null };
    case 'order':
      return { commands: ['/sales/orders', name], draft: null };
    case 'purchase':
      return entry.continuable
        ? { commands: ['/purchases/new'], draft: name }
        : { commands: ['/purchases/order', name], draft: null };
    case 'payment':
      return entry.continuable && entry.invoice
        ? { commands: ['/purchases/invoice', entry.invoice, 'pay'], draft: name }
        : { commands: ['/purchases/payment', name], draft: null };
  }
}

export function buildDraftsView(input: DraftsViewInput, tr: Translator): DraftsView {
  const term = input.term.trim().toLowerCase();
  const shown = input.entries.filter(
    (e) => !term || e.party.toLowerCase().includes(term) || e.name.toLowerCase().includes(term),
  );
  return {
    subtitle: tr.t('drafts.subtitle', {
      drafts: tr.plural('home.draftCount', shown.length),
      business: input.business,
    }),
    cards: shown.map((e) => {
      const money = BUYING.includes(e.kind) && !input.seeCosts ? null : e.total;
      const parts = [
        money === null ? null : formatMoney(money, e.currency || input.currency),
        e.units === null ? null : tr.plural('drafts.units', e.units),
        tr.t('drafts.updated', { when: ago(e.modified, input.now, tr) }),
      ];
      return {
        id: draftId(e),
        title: tr.t(`drafts.title.${e.kind}`, { party: e.party }),
        meta: parts.filter((p): p is string => p !== null).join(' · '),
        action: draftAction(e, tr),
        primary: e.kind === 'sale' && e.continuable,
        deletable: e.deletable,
        deleteLabel: tr.t('drafts.delete.button'),
      };
    }),
    empty: term
      ? { title: tr.t('drafts.noMatch.title'), message: tr.t('drafts.noMatch.message') }
      : { title: tr.t('drafts.empty.title'), message: tr.t('drafts.empty.message') },
    note: tr.t('drafts.note'),
  };
}

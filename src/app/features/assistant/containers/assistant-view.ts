import { formatMoney } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { SpeechInputProblem, SpeechLanguage } from '../../../core/speech/speech.models';
import { PrefillKind } from '../../../core/tasks/task-prefill.service';
import {
  ApiMessage,
  ChoiceOption,
  ContentBlock,
  ProblemKind,
  Proposal,
  RecordKind,
  RecordLink,
} from '../data-access/assistant.models';
import { AssistantState } from '../data-access/assistant.store';
import { ToolName } from '../data-access/assistant-tools';
import { ReplyBlock, parseReplyText, plainBlocks } from './reply-text';

export interface LinkView {
  /** `kind:id`, which `recordRoute` turns into where the button goes. */
  key: string;
  label: string;
}

/** A card for something the assistant prepared: what it is, what it holds, and the button that opens it. */
export interface ProposalCardView {
  id: string;
  title: string;
  lines: string[];
  note: string | null;
  action: string;
}

export interface ChoiceView {
  id: string;
  label: string;
}

/** What "Read aloud" speaks: the reply as plain text, and the language of the voice for it. */
export interface SpeechView {
  text: string;
  lang: SpeechLanguage;
  label: string;
}

export interface ConversationItemView {
  id: string;
  role: 'user' | 'assistant';
  /** The accessible name of the bubble: who wrote it. */
  author: string;
  blocks: ReplyBlock[];
  links: LinkView[];
  proposals: ProposalCardView[];
  /** The matches the assistant asked the user to pick from, while that question is the last thing said. */
  choices: ChoiceView[];
  choicesLabel: string;
  /** Only finished assistant replies can be read aloud. */
  speech: SpeechView | null;
}

export interface AssistantView {
  title: string;
  subtitle: string;
  placeholder: string;
  composerLabel: string;
  send: string;
  stop: string;
  speak: string;
  stopListening: string;
  listeningLine: string;
  /** The notice for a microphone that is off or a recording nothing could be made of. */
  voiceProblem: string | null;
  note: string;
  newChat: string;
  conversation: string;
  suggestionsLabel: string;
  suggestions: string[];
  items: ConversationItemView[];
  /** One muted line for each lookup that is running. */
  activity: string[];
  problem: string | null;
  busy: boolean;
  /** Offers New chat and shows the conversation rather than the suggestions. */
  started: boolean;
}

export interface AssistantViewInput {
  messages: readonly ApiMessage[];
  links: Readonly<Record<number, readonly RecordLink[]>>;
  proposals: Readonly<Record<number, readonly Proposal[]>>;
  choices: Readonly<Record<number, readonly ChoiceOption[]>>;
  currency: string;
  /** The reply being written, as far as it has streamed. */
  streaming: string;
  state: AssistantState;
  activeTools: readonly ToolName[];
  problem: ProblemKind | null;
  voiceProblem: SpeechInputProblem | null;
  language: Language;
}

const MAX_LINKS = 5;
export const NONE_OF_THESE = 'none-of-these';

const textOf = (content: string | ContentBlock[]): string =>
  typeof content === 'string'
    ? content
    : content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');

const VOICE_PROBLEM_KEY: Record<SpeechInputProblem, string> = {
  denied: 'denied',
  nomicrophone: 'noMicrophone',
  network: 'offline',
  nospeech: 'noSpeech',
};

const ARABIC_LETTERS = /\p{Script=Arabic}/gu;
const LATIN_LETTERS = /\p{Script=Latin}/gu;

const IDENTIFIER = /\d|[A-Z]{2,}/;

const withoutIdentifiers = (text: string) =>
  text
    .split(/\s+/)
    .filter((token) => !IDENTIFIER.test(token))
    .join(' ');

/** A reply is read with the voice of its dominant script; the app's language breaks a tie. */
export const speechLanguage = (text: string, ui: Language): SpeechLanguage => {
  const words = withoutIdentifiers(text);
  const arabic = words.match(ARABIC_LETTERS)?.length ?? 0;
  const latin = words.match(LATIN_LETTERS)?.length ?? 0;
  return arabic > latin ? 'ar' : latin > arabic ? 'en' : ui;
};

function plainText(blocks: readonly ReplyBlock[]): string {
  const run = (segments: readonly { text: string }[]) => segments.map((s) => s.text).join('');
  return blocks
    .map((block) => (block.kind === 'list' ? block.items.map(run).join('\n') : run(block.segments)))
    .join('\n\n')
    .trim();
}

const BUTTON: Record<PrefillKind, string> = {
  quick_sale: 'sale',
  quotation: 'quotation',
  purchase_order: 'purchase',
  collect_payment: 'payment',
  stock_move: 'move',
  new_customer: 'newCustomer',
  new_supplier: 'newSupplier',
  new_item: 'newItem',
};

export const PROPOSAL_ROUTES: Record<PrefillKind, string[]> = {
  quick_sale: ['/sales/new', 'basket'],
  quotation: ['/sales/quote/new'],
  purchase_order: ['/purchases/new'],
  collect_payment: ['/money/receive'],
  stock_move: ['/inventory/transfer'],
  new_customer: ['/contacts/new'],
  new_supplier: ['/contacts/new'],
  new_item: ['/catalog/new'],
};

export function proposalCard(
  proposal: Proposal,
  currency: string,
  tr: Translator,
): ProposalCardView {
  const { t } = tr;
  const money = (amount: number) => formatMoney(amount, currency);
  const lines = proposal.lines.map((line) =>
    line.amount === null
      ? t('assistant.proposal.lineNoPrice', { qty: line.qty, item: line.name })
      : t('assistant.proposal.line', {
          qty: line.qty,
          item: line.name,
          amount: money(line.amount),
        }),
  );
  const name = proposal.party ?? '';
  switch (proposal.kind) {
    case 'quick_sale':
    case 'quotation':
    case 'purchase_order': {
      const title =
        proposal.kind === 'quotation'
          ? t('assistant.proposal.quotation', { name })
          : proposal.kind === 'purchase_order'
            ? t('assistant.proposal.purchase', { name })
            : proposal.party
              ? t('assistant.proposal.sale', { name })
              : t('assistant.proposal.walkInSale');
      return {
        id: proposal.id,
        title,
        lines:
          proposal.total === null
            ? lines
            : [...lines, t('assistant.proposal.total', { amount: money(proposal.total) })],
        note: t('assistant.proposal.note'),
        action: t(`assistant.proposal.button.${BUTTON[proposal.kind]}`),
      };
    }
    case 'collect_payment':
      return {
        id: proposal.id,
        title: t('assistant.proposal.payment', { name }),
        lines: [
          proposal.amount === null
            ? t('assistant.proposal.amountAll')
            : t('assistant.proposal.amount', { amount: money(proposal.amount) }),
          ...(proposal.due === null
            ? []
            : [t('assistant.proposal.due', { amount: money(proposal.due) })]),
        ],
        note: t('assistant.proposal.note'),
        action: t('assistant.proposal.button.payment'),
      };
    case 'stock_move': {
      const anywhere = t('assistant.proposal.anywhere');
      return {
        id: proposal.id,
        title: t('assistant.proposal.move', { item: proposal.item ?? '' }),
        lines: [
          ...proposal.lines.map((line) =>
            t('assistant.proposal.moveLine', { qty: line.qty, item: line.name }),
          ),
          ...(proposal.from || proposal.to
            ? [
                t('assistant.proposal.route', {
                  from: proposal.from ?? anywhere,
                  to: proposal.to ?? anywhere,
                }),
              ]
            : []),
        ],
        note: t('assistant.proposal.note'),
        action: t('assistant.proposal.button.move'),
      };
    }
    case 'new_customer':
    case 'new_supplier':
    case 'new_item':
      return {
        id: proposal.id,
        title: t(`assistant.proposal.${BUTTON[proposal.kind]}`, { name }),
        lines: [],
        note: proposal.similarNames
          ? `${t('assistant.proposal.note')} ${t('assistant.proposal.similarNames')}`
          : t('assistant.proposal.note'),
        action: t(`assistant.proposal.button.${BUTTON[proposal.kind]}`),
      };
    case 'open_record': {
      const record = proposal.record;
      return {
        id: proposal.id,
        title: record
          ? t(`assistant.proposal.record.${record.draft ? 'draft' : record.kind}`, {
              name: record.label,
            })
          : '',
        lines: [],
        note: null,
        action: t('assistant.proposal.button.record'),
      };
    }
  }
}

export function proposalTarget(
  proposal: Proposal,
  prefill: string | null,
): { commands: string[]; queryParams?: Record<string, string> } | null {
  if (proposal.request) {
    const { kind } = proposal.request;
    return prefill
      ? {
          commands: PROPOSAL_ROUTES[kind],
          queryParams: {
            prefill,
            ...(kind === 'new_customer' || kind === 'new_supplier'
              ? { type: kind === 'new_customer' ? 'customers' : 'suppliers' }
              : {}),
          },
        }
      : null;
  }
  const route = proposal.record && recordRoute(`${proposal.record.kind}:${proposal.record.id}`);
  return route ? { commands: route } : null;
}

export const recordKey = (link: Pick<RecordLink, 'kind' | 'id'>) => `${link.kind}:${link.id}`;

/** Where a record's button goes: the page Madar already has for it. */
export function recordRoute(key: string): string[] | null {
  const colon = key.indexOf(':');
  const kind = key.slice(0, colon) as RecordKind;
  const id = key.slice(colon + 1);
  switch (kind) {
    case 'invoice':
      return ['/sales/invoices', id];
    case 'quotation':
      return ['/sales/quotes', id];
    case 'salesOrder':
      return ['/sales/orders', id];
    case 'customer':
      return ['/contacts/customers', id];
    case 'supplier':
      return ['/contacts/suppliers', id];
    case 'item':
      return ['/catalog', id];
    case 'purchaseOrder':
      return ['/purchases/order', id];
    case 'draft':
      return ['/drafts'];
    default:
      return null;
  }
}

/** The records a reply names: a tool returned them, and its text mentions them. */
function linksFor(text: string, records: readonly RecordLink[], tr: Translator): LinkView[] {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const links: LinkView[] = [];
  for (const record of records) {
    const key = recordKey(record);
    if (seen.has(key) || !record.mentions.some((m) => m && lower.includes(m.toLowerCase()))) {
      continue;
    }
    seen.add(key);
    links.push({ key, label: tr.t('assistant.open', { name: record.label }) });
  }
  return links.slice(0, MAX_LINKS);
}

/** The matches to pick from; close matches to a name nothing matched also get a way to say none of them is it. */
function withNone(options: readonly ChoiceOption[], none: string): ChoiceView[] {
  const views = options.map(({ id, label }) => ({ id, label }));
  return options.some((option) => option.suggested)
    ? [...views, { id: NONE_OF_THESE, label: none }]
    : views;
}

export function buildAssistantView(input: AssistantViewInput, tr: Translator): AssistantView {
  const { t } = tr;
  const you = t('assistant.you');
  const assistant = t('assistant.assistant');
  const items: ConversationItemView[] = [];
  input.messages.forEach((message, index) => {
    const text = textOf(message.content);
    if (!text.trim()) {
      return;
    }
    const user = message.role === 'user';
    const blocks = user ? plainBlocks(text) : parseReplyText(text);
    const spoken = user ? '' : plainText(blocks);
    items.push({
      id: `m${index}`,
      role: message.role,
      author: user ? you : assistant,
      blocks,
      links: user ? [] : linksFor(text, input.links[index] ?? [], tr),
      proposals: user
        ? []
        : (input.proposals[index] ?? []).map((p) => proposalCard(p, input.currency, tr)),
      choices:
        user || index !== input.messages.length - 1
          ? []
          : withNone(input.choices[index] ?? [], t('assistant.choices.none')),
      choicesLabel: t('assistant.choices.label'),
      speech: spoken
        ? {
            text: spoken,
            lang: speechLanguage(spoken, input.language),
            label: t('assistant.voice.readAloud'),
          }
        : null,
    });
  });
  if (input.streaming.trim()) {
    items.push({
      id: 'streaming',
      role: 'assistant',
      author: assistant,
      blocks: parseReplyText(input.streaming),
      links: [],
      proposals: [],
      choices: [],
      choicesLabel: '',
      speech: null,
    });
  }
  const busy = input.state === 'sending' || input.state === 'running-tool';
  return {
    title: t('assistant.title'),
    subtitle: t('assistant.subtitle'),
    placeholder: t('assistant.placeholder'),
    composerLabel: t('assistant.composerLabel'),
    send: t('assistant.send'),
    stop: t('assistant.stop'),
    speak: t('assistant.voice.speak'),
    stopListening: t('assistant.voice.stopListening'),
    listeningLine: t('assistant.voice.listening'),
    voiceProblem: input.voiceProblem
      ? t(`assistant.voice.${VOICE_PROBLEM_KEY[input.voiceProblem]}`)
      : null,
    note: t('assistant.note'),
    newChat: t('assistant.newChat'),
    conversation: t('assistant.conversation'),
    suggestionsLabel: t('assistant.suggestions.label'),
    suggestions: [
      t('assistant.suggestions.sales'),
      t('assistant.suggestions.owed'),
      t('assistant.suggestions.lowStock'),
    ],
    items,
    activity:
      input.state === 'running-tool'
        ? [...new Set(input.activeTools.map((name) => t(`assistant.activity.${name}`)))]
        : [],
    problem: input.problem ? t(`assistant.problem.${input.problem}`) : null,
    busy,
    started: input.messages.length > 0,
  };
}

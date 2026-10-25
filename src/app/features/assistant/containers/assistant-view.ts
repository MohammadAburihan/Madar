import { Translator } from '../../../core/i18n/translator';
import {
  ApiMessage,
  ContentBlock,
  ProblemKind,
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

export interface ConversationItemView {
  id: string;
  role: 'user' | 'assistant';
  /** The accessible name of the bubble: who wrote it. */
  author: string;
  blocks: ReplyBlock[];
  links: LinkView[];
}

export interface AssistantView {
  title: string;
  subtitle: string;
  placeholder: string;
  composerLabel: string;
  send: string;
  stop: string;
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
  /** The reply being written, as far as it has streamed. */
  streaming: string;
  state: AssistantState;
  activeTools: readonly ToolName[];
  problem: ProblemKind | null;
}

const MAX_LINKS = 5;

const textOf = (content: string | ContentBlock[]): string =>
  typeof content === 'string'
    ? content
    : content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');

export const recordKey = (link: Pick<RecordLink, 'kind' | 'id'>) => `${link.kind}:${link.id}`;

/** Where a record's button goes: the page Madar already has for it. */
export function recordRoute(key: string): string[] | null {
  const colon = key.indexOf(':');
  const kind = key.slice(0, colon) as RecordKind;
  const id = key.slice(colon + 1);
  switch (kind) {
    case 'invoice':
      return ['/sales/invoices', id];
    case 'customer':
      return ['/contacts/customers', id];
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
    items.push({
      id: `m${index}`,
      role: message.role,
      author: user ? you : assistant,
      blocks: user ? plainBlocks(text) : parseReplyText(text),
      links: user ? [] : linksFor(text, input.links[index] ?? [], tr),
    });
  });
  if (input.streaming.trim()) {
    items.push({
      id: 'streaming',
      role: 'assistant',
      author: assistant,
      blocks: parseReplyText(input.streaming),
      links: [],
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

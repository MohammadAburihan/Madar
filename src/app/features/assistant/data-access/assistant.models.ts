import { Capabilities } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { PrefillKind, PrefillRequest } from '../../../core/tasks/task-prefill.service';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Thinking and other blocks are kept as the service sent them: the next request must repeat them. */
export interface OtherBlock {
  type: string;
  [key: string]: unknown;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | OtherBlock;

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ChatContext {
  business: string;
  currency: string;
  today: string;
  persona: string;
}

export interface ChatRequest {
  language: 'en' | 'ar';
  context: ChatContext;
  tools: string[];
  messages: ApiMessage[];
}

export interface AssistantReply {
  content: ContentBlock[];
  stopReason: string | null;
}

export type ProblemKind = 'busy' | 'rate_limited' | 'unavailable' | 'refusal';

/** Why the assistant could not answer; `unauthorized` is the session ending, not a problem to show. */
export class AssistantError extends Error {
  constructor(readonly kind: ProblemKind | 'unauthorized') {
    super(`Assistant: ${kind}`);
  }
}

export type RecordKind =
  | 'invoice'
  | 'quotation'
  | 'salesOrder'
  | 'purchaseOrder'
  | 'customer'
  | 'supplier'
  | 'item'
  | 'draft';

/** A record a tool returned, which the reply may open: shown only when the reply mentions it. */
export interface RecordLink {
  kind: RecordKind;
  id: string;
  label: string;
  mentions: string[];
}

export type ProposalKind = PrefillKind | 'open_record';

export interface ProposalLine {
  name: string;
  qty: number;
  /** What the line comes to; null when the task will price it (no price set, or not shown to the role). */
  amount: number | null;
}

/** What a tool prepared for the chat's card: a task to fill in (`request`) or a record's page (`record`). */
export interface Proposal {
  id: string;
  kind: ProposalKind;
  party: string | null;
  item: string | null;
  lines: ProposalLine[];
  total: number | null;
  /** A collection: the amount proposed (null = everything due) and what the customer owes. */
  amount: number | null;
  due: number | null;
  from: string | null;
  to: string | null;
  record: { kind: RecordKind; id: string; label: string; draft: boolean } | null;
  request: PrefillRequest | null;
}

/** One of the matches a name could mean; `label` is what the user sends back to pick it. */
export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
  /** ERPNext refused the read: the caller checks whether the session ended. */
  forbidden: boolean;
  records: RecordLink[];
  proposals?: Proposal[];
  choices?: ChoiceOption[];
}

/** The tool refuses with a reason the assistant can pass on, as opposed to a lookup that broke. */
export class ToolFailure extends Error {}

export interface ToolScope {
  persona: Persona;
  caps: Capabilities;
  userId: string;
  company: string;
  currency: string;
  today: string;
}

export interface ToolFound {
  payload: Record<string, unknown>;
  listKey: string | null;
  records: RecordLink[];
  proposals?: Proposal[];
  choices?: ChoiceOption[];
}

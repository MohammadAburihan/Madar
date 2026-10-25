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

export type RecordKind = 'invoice' | 'customer' | 'item' | 'purchaseOrder' | 'draft';

/** A record a tool returned, which the reply may open: shown only when the reply mentions it. */
export interface RecordLink {
  kind: RecordKind;
  id: string;
  label: string;
  mentions: string[];
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
  /** ERPNext refused the read: the caller checks whether the session ended. */
  forbidden: boolean;
  records: RecordLink[];
}

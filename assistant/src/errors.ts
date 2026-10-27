import Anthropic from '@anthropic-ai/sdk';

const MAX_MESSAGE = 400;

const bodyType = (body: unknown): string | undefined => {
  const inner = (body as { error?: { type?: unknown } } | undefined)?.error;
  return typeof inner?.type === 'string' ? inner.type : undefined;
};

// Status, type and the API's own message only: never headers, cookies or request content.
export function describeApiError(error: unknown): {
  status: string;
  type: string;
  message: string;
} {
  if (!(error instanceof Anthropic.APIError)) {
    return {
      status: 'none',
      type: 'none',
      message: error instanceof Error ? error.name : 'unknown',
    };
  }
  return {
    status: String(error.status ?? 'none'),
    type: error.type ?? bodyType(error.error) ?? 'none',
    message: error.message.replace(/\s+/g, ' ').slice(0, MAX_MESSAGE),
  };
}

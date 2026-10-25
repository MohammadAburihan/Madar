import type Anthropic from '@anthropic-ai/sdk';

type ToolDef = Omit<Anthropic.Tool, 'name'>;

export const toolRegistry: Record<string, ToolDef> = {
  get_today_summary: {
    description: "Returns the business's sales and amounts due for today.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
};

export function selectTools(names: readonly string[]): Anthropic.Tool[] {
  const unique = [...new Set(names)].filter((name) => Object.hasOwn(toolRegistry, name));
  const tools = unique.map((name): Anthropic.Tool => ({ name, ...toolRegistry[name]! }));
  const last = tools.at(-1);
  if (last) last.cache_control = { type: 'ephemeral' };
  return tools;
}

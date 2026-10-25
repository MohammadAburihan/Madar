export interface Config {
  apiKey: string;
  model: string;
  erpnextUpstream: string;
  erpnextSiteHost: string;
  port: number;
  ratePerMin: number;
  dailyTokens: number;
  globalDailyTokens: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const apiKey = env['ANTHROPIC_API_KEY']?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  const erpnextSiteHost = env['ERPNEXT_SITE_HOST']?.trim();
  if (!erpnextSiteHost) throw new Error('ERPNEXT_SITE_HOST is required');
  return {
    apiKey,
    model: env['ASSISTANT_MODEL']?.trim() || 'claude-haiku-5-5',
    erpnextUpstream: (env['ERPNEXT_UPSTREAM']?.trim() || 'http://frontend:8080').replace(
      /\/+$/,
      '',
    ),
    erpnextSiteHost,
    port: positive(env['PORT'], 8080, 'PORT'),
    ratePerMin: positive(env['ASSISTANT_RATE_PER_MIN'], 20, 'ASSISTANT_RATE_PER_MIN'),
    dailyTokens: positive(env['ASSISTANT_DAILY_TOKENS'], 400000, 'ASSISTANT_DAILY_TOKENS'),
    globalDailyTokens: positive(
      env['ASSISTANT_GLOBAL_DAILY_TOKENS'],
      3000000,
      'ASSISTANT_GLOBAL_DAILY_TOKENS',
    ),
  };
}

function positive(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  return value;
}

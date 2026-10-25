import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createLimits } from '../src/limits.js';

describe('limits', () => {
  it('resets the daily token count at UTC midnight and the rate window after a minute', () => {
    let time = Date.UTC(2026, 9, 25, 23, 59, 0);
    const limits = createLimits({ ratePerMin: 1, dailyOutputTokens: 10, now: () => time });
    expect(limits.check('u')).toBe(true);
    expect(limits.check('u')).toBe(false);
    limits.addOutputTokens('u', 10);
    time += 61_000;
    expect(limits.check('u')).toBe(true);
    expect(limits.check('v')).toBe(true);
    time = Date.UTC(2026, 9, 26, 0, 0, 30);
    time += 61_000;
    expect(limits.check('u')).toBe(true);
  });
});

describe('config', () => {
  it('requires the API key and site host', () => {
    expect(() => loadConfig({ ERPNEXT_SITE_HOST: 'h' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'k' })).toThrow(/ERPNEXT_SITE_HOST/);
  });

  it('applies defaults', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'k', ERPNEXT_SITE_HOST: 'h' })).toMatchObject({
      model: 'claude-haiku-5-5',
      erpnextUpstream: 'http://frontend:8080',
      port: 8080,
      ratePerMin: 20,
      dailyOutputTokens: 50000,
    });
  });

  it('rejects a bad number', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'k', ERPNEXT_SITE_HOST: 'h', PORT: 'x' })).toThrow(
      /PORT/,
    );
  });
});

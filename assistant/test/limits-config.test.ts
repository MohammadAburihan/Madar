import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { billedTokens, createLimits } from '../src/limits.js';

const make = (over: Partial<Parameters<typeof createLimits>[0]> = {}) =>
  createLimits({ ratePerMin: 20, dailyTokens: 1000, globalDailyTokens: 5000, ...over });

describe('limits', () => {
  it('weights cache reads at 0.1 and counts every billed token', () => {
    expect(billedTokens({ input: 100, cacheWrite: 50, cacheRead: 1000, output: 20 })).toBe(270);
  });

  it('allows one in-flight request per user and frees it on settle', () => {
    const limits = make();
    const first = limits.reserve('u', 10);
    expect(first.ok).toBe(true);
    expect(limits.reserve('u', 10)).toEqual({ ok: false, reason: 'busy' });
    expect(limits.reserve('v', 10).ok).toBe(true);
    if (first.ok) first.reservation.settle(0);
    expect(limits.reserve('u', 10).ok).toBe(true);
  });

  it('rejects a reservation beyond the remaining daily budget and counts settled usage', () => {
    const limits = make();
    expect(limits.reserve('u', 1001)).toEqual({ ok: false, reason: 'budget' });
    const r = limits.reserve('u', 100);
    if (r.ok) r.reservation.settle(950);
    expect(limits.reserve('u', 100)).toEqual({ ok: false, reason: 'budget' });
  });

  it('keeps a global budget that includes in-flight reservations', () => {
    const limits = make({ dailyTokens: 1000, globalDailyTokens: 1500 });
    expect(limits.reserve('a', 900).ok).toBe(true);
    expect(limits.reserve('b', 900)).toEqual({ ok: false, reason: 'budget' });
  });

  it('resets budgets at UTC midnight and the rate window after a minute', () => {
    let time = Date.UTC(2026, 9, 25, 12, 0, 0);
    const limits = make({ ratePerMin: 1, now: () => time });
    const r = limits.reserve('u', 10);
    if (r.ok) r.reservation.settle(1000);
    expect(limits.reserve('u', 10)).toEqual({ ok: false, reason: 'rate' });
    time += 61_000;
    expect(limits.reserve('u', 10)).toEqual({ ok: false, reason: 'budget' });
    time = Date.UTC(2026, 9, 26, 0, 0, 30);
    expect(limits.reserve('u', 10).ok).toBe(true);
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
      dailyTokens: 400000,
      globalDailyTokens: 3000000,
    });
  });

  it('rejects a bad number', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'k', ERPNEXT_SITE_HOST: 'h', PORT: 'x' })).toThrow(
      /PORT/,
    );
  });
});

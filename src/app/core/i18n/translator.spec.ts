import { TranslocoService } from '@jsverse/transloco';
import { createTranslator, isolate } from './translator';

describe('createTranslator', () => {
  const transloco = {
    translate: (key: string, params: Record<string, unknown> = {}) =>
      key === 'subtitle' ? `Sign in to ${params['business']}.` : `${params['count']} items`,
  } as unknown as TranslocoService;

  it('isolates every interpolated value, for every caller', () => {
    const tr = createTranslator(transloco, 'ar');

    expect(tr.t('subtitle', { business: 'Acme Co.' })).toBe(`Sign in to ${isolate('Acme Co.')}.`);
    expect(tr.plural('items', 3)).toBe(`${isolate(3)} items`);
  });
});

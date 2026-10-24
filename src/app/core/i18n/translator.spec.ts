import { TranslocoService } from '@jsverse/transloco';
import { createTranslator, isolate, isolateFor } from './translator';

describe('isolateFor', () => {
  it('leaves Arabic-only values unmarked in the Arabic UI', () => {
    expect(isolateFor('حنين حبش', 'ar')).toBe('حنين حبش');
  });

  it('isolates Latin names, mixed values, identifiers and amounts in the Arabic UI', () => {
    expect(isolateFor('Hanin Habash', 'ar')).toBe(isolate('Hanin Habash'));
    expect(isolateFor('حنين 2', 'ar')).toBe(isolate('حنين 2'));
    expect(isolateFor('حنين Co', 'ar')).toBe(isolate('حنين Co'));
    expect(isolateFor('ILS 45.00', 'ar')).toBe(isolate('ILS 45.00'));
    expect(isolateFor('SI-1042', 'ar')).toBe(isolate('SI-1042'));
    expect(isolateFor(3, 'ar')).toBe(isolate(3));
    expect(isolateFor('٣٠٠', 'ar')).toBe(isolate('٣٠٠'));
    expect(isolateFor('', 'ar')).toBe(isolate(''));
  });

  it('always isolates in the English UI', () => {
    expect(isolateFor('حنين حبش', 'en')).toBe(isolate('حنين حبش'));
    expect(isolateFor('Acme', 'en')).toBe(isolate('Acme'));
  });
});

describe('createTranslator', () => {
  const transloco = {
    translate: (key: string, params: Record<string, unknown> = {}) =>
      key === 'subtitle' ? `Sign in to ${params['business']}.` : `${params['count']} items`,
  } as unknown as TranslocoService;

  it('isolates interpolated values, except Arabic-only ones in Arabic', () => {
    const tr = createTranslator(transloco, 'ar');

    expect(tr.t('subtitle', { business: 'Acme Co.' })).toBe(`Sign in to ${isolate('Acme Co.')}.`);
    expect(tr.t('subtitle', { business: 'مشتل ريحان' })).toBe('Sign in to مشتل ريحان.');
    expect(tr.plural('items', 3)).toBe(`${isolate(3)} items`);
    expect(tr.isolate('مشتل')).toBe('مشتل');
  });

  it('isolates every interpolated value in English', () => {
    const tr = createTranslator(transloco, 'en');

    expect(tr.t('subtitle', { business: 'مشتل ريحان' })).toBe(
      `Sign in to ${isolate('مشتل ريحان')}.`,
    );
    expect(tr.isolate('Acme')).toBe(isolate('Acme'));
  });
});

import { realTranslator } from '../../../../testing/real-translator';
import { nextShiftLine, shiftLabel, shiftLine } from './shift-view';

const visible = (value: string) => value.replace(/[⁦-⁩]/g, '');
const MORNING = { name: 'Morning', start: '07:00', end: '15:00' };

describe('shift view', () => {
  it('names the shift with its times, kept left to right', () => {
    expect(shiftLabel(MORNING)).toBe('Morning · ⁦07:00–15:00⁩');
    expect(shiftLabel({ name: 'Night', start: '', end: '' })).toBe('Night');
  });

  it("says the worker's shift, or that none is assigned, in both languages", () => {
    expect(visible(shiftLine(MORNING, realTranslator('en')))).toBe('Shift: Morning · 07:00–15:00');
    expect(shiftLine(null, realTranslator('en'))).toBe('No shift assigned');
    expect(visible(shiftLine(MORNING, realTranslator('ar')))).toBe(
      'الوردية: Morning · 07:00–15:00',
    );
  });

  it('says when the next shift starts', () => {
    const next = { shift: MORNING, from: '2026-10-26' };
    expect(visible(nextShiftLine(next, 'en', realTranslator('en')))).toBe(
      'From 26 Oct 2026: Morning · 07:00–15:00',
    );
    expect(visible(nextShiftLine(next, 'ar', realTranslator('ar')))).toBe(
      'من 26 أكتوبر 2026: Morning · 07:00–15:00',
    );
  });
});

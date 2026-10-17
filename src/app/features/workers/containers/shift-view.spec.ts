import { realTranslator } from '../../../../testing/real-translator';
import { shiftLabel, shiftLine } from './shift-view';

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
});

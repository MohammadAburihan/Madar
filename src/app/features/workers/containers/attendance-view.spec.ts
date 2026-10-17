import { realTranslator } from '../../../../testing/real-translator';
import { saveLabel, sheetRowView, statusOptions } from './attendance-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const ROW = {
  id: 'E1',
  name: 'Khaled Omar',
  designation: 'Gardener',
  state: { kind: 'open' },
} as const;

describe('attendance view', () => {
  it('labels each row like the mock, and says why a row is closed', () => {
    expect(visible(sheetRowView(ROW, 'en', en))).toEqual({
      id: 'E1',
      label: 'Khaled Omar · Gardener',
      note: null,
    });
    expect(
      visible(sheetRowView({ ...ROW, state: { kind: 'leave', until: '2026-10-20' } }, 'en', en))
        .note,
    ).toBe('On leave until 20 Oct 2026');
    expect(
      visible(sheetRowView({ ...ROW, state: { kind: 'marked', status: 'Half Day' } }, 'en', en))
        .note,
    ).toBe('Marked: Half day');
    expect(sheetRowView({ ...ROW, designation: null }, 'en', en).label).toBe('Khaled Omar');
  });

  it('offers the four statuses and counts the workers to save, in both languages', () => {
    expect(statusOptions(en).map((o) => o.label)).toEqual([
      'Present',
      'Absent',
      'Half day',
      'Working from home',
    ]);
    expect(visible(saveLabel(1, en))).toBe('Save attendance · 1 worker');
    expect(visible(saveLabel(2, en))).toBe('Save attendance · 2 workers');
    expect(visible(saveLabel(2, ar))).toBe('حفظ الحضور · عاملان');
    expect(
      visible(sheetRowView({ ...ROW, state: { kind: 'marked', status: 'Present' } }, 'ar', ar))
        .note,
    ).toBe('مسجّل: حاضر');
  });
});

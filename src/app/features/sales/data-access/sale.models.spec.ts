import { lineTotal, parseNumber } from './sale.models';

describe('sale models', () => {
  it('rounds the discounted unit rate before multiplying, like ERPNext', () => {
    expect(lineTotal({ qty: 7, rate: 1.15, discount: 5 })).toBe(7.63);
    expect(lineTotal({ qty: 2, rate: 85, discount: 0 })).toBe(170);
  });

  it('parses Western and Arabic-Indic numbers', () => {
    expect(parseNumber('1,250.50')).toBe(1250.5);
    expect(parseNumber('١٢٠')).toBe(120);
    expect(parseNumber('۱۲٫۵')).toBe(12.5);
    expect(parseNumber('١٬٢٥٠')).toBe(1250);
    expect(parseNumber('  ')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
  });
});

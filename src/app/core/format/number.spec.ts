import { parseNumber, round2 } from './number';

describe('number', () => {
  it('rounds to cents', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
  });

  it('parses Western and Arabic-Indic input', () => {
    expect(parseNumber('1,250.50')).toBe(1250.5);
    expect(parseNumber('٥٠٫٥')).toBe(50.5);
    expect(parseNumber('۱۲')).toBe(12);
    expect(parseNumber('')).toBeNaN();
  });
});

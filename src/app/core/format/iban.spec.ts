import { isValidAccountNumber, isValidIban, normalizeAccountNumber, normalizeIban } from './iban';

describe('iban', () => {
  it('normalises spaces, case and Arabic-Indic digits', () => {
    expect(normalizeIban(' jo94 cbjo 0010 0000 0000 0131 0003 02 ')).toBe(
      'JO94CBJO0010000000000131000302',
    );
    expect(normalizeIban('jo٩٤cbjo٠٠١٠٠٠٠٠٠٠٠٠٠١٣١٠٠٠٣٠٢')).toBe('JO94CBJO0010000000000131000302');
  });

  it('accepts IBANs whose mod-97 checksum holds', () => {
    expect(isValidIban('JO94CBJO0010000000000131000302')).toBe(true);
    expect(isValidIban('gb82 west 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('جو٩٤CBJO0010000000000131000302'.replace('جو', 'JO'))).toBe(true);
  });

  it('refuses a wrong checksum, a wrong shape and nothing', () => {
    expect(isValidIban('JO95CBJO0010000000000131000302')).toBe(false);
    expect(isValidIban('JO00BAD')).toBe(false);
    expect(isValidIban('1234567890123456')).toBe(false);
    expect(isValidIban('GB82-WEST-1234-5698-7654-32')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('keeps account numbers to letters, digits and dashes, in Western digits', () => {
    expect(normalizeAccountNumber(' ١٢٣ 456-7 ')).toBe('123456-7');
    expect(isValidAccountNumber('١٢٣٤٥-AB')).toBe(true);
    expect(isValidAccountNumber('12 34')).toBe(true);
    expect(isValidAccountNumber('12/34')).toBe(false);
    expect(isValidAccountNumber('12.34')).toBe(false);
  });

  it('drops bidi marks and no-break spaces pasted with a number', () => {
    const pasted = '\u200EJO94\u00A0CBJO\u202A0010\u2066000000000131000302\u202C\uFEFF';
    expect(normalizeIban(pasted)).toBe('JO94CBJO0010000000000131000302');
    expect(isValidIban(pasted)).toBe(true);
    expect(normalizeAccountNumber('\u200F12\u00A034-5\u200E')).toBe('1234-5');
    expect(isValidAccountNumber('\u200F12-34\u200E')).toBe(true);
  });
});

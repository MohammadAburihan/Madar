export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Arabic-Indic and Persian digits as Western ones (codes typed on an Arabic keyboard: barcodes, phone numbers). */
export function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Parses typed numbers, accepting Arabic-Indic digits and separators from Arabic keyboards. */
export function parseNumber(text: string): number {
  const western = westernDigits(text.trim()).replace(/٫/g, '.').replace(/[,٬]/g, '');
  return western === '' ? NaN : Number(western);
}

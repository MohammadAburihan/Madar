export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Parses typed numbers, accepting Arabic-Indic digits and separators from Arabic keyboards. */
export function parseNumber(text: string): number {
  const western = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[,٬]/g, '');
  return western === '' ? NaN : Number(western);
}

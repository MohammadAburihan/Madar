import { round2 } from '../format/number';
import { PrefillLine } from './task-prefill.service';

export const MAX_PREFILL_QTY = 10_000;

export const validQty = (qty: number) => Number.isFinite(qty) && qty > 0 && qty <= MAX_PREFILL_QTY;

export function mergeLines(lines: readonly PrefillLine[]): PrefillLine[] {
  const merged = new Map<string, PrefillLine>();
  for (const line of lines) {
    const held = merged.get(line.item_code);
    merged.set(line.item_code, held ? { ...held, qty: held.qty + line.qty } : { ...line });
  }
  return [...merged.values()];
}

/** The proposed rate where the role may set prices and it is a real amount; otherwise the task's own price. */
export function lineRate(line: PrefillLine, mayType: boolean, listed: number): number {
  const typed = line.rate;
  return mayType && typed !== undefined && Number.isFinite(typed) && typed >= 0
    ? round2(typed)
    : listed;
}

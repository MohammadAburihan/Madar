import { westernDigits } from '../format/number';

/**
 * Names this similar (1 - edits / longer length) count as a "did you mean". With 0.6, one slip in a short name
 * (Lina/Lena, 0.75) and a vowel typo in a first name (Leena/Lina, 0.6) pass, while two edits in four letters
 * (Omar/Amir, 0.5) and unrelated names do not.
 */
export const SIMILARITY_THRESHOLD = 0.6;

const MIN_QUERY_LENGTH = 3;
const MAX_TERMS = 12;

const ARABIC_FOLDS: [RegExp, string][] = [
  [/[أإآ]/g, 'ا'],
  [/ة/g, 'ه'],
  [/ى/g, 'ي'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ي'],
  [/ـ/g, ''],
];

function fold(text: string): string {
  let out = westernDigits(text).normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  for (const [pattern, to] of ARABIC_FOLDS) {
    out = out.replace(pattern, to);
  }
  return out.toLowerCase();
}

/** Lowercase Latin, folded Arabic letter variants, no marks, spaces or punctuation: what two spellings are compared on. */
export const normalizeText = (text: string): string => fold(text).replace(/[^\p{L}\p{N}]/gu, '');

function tokensOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Edits (insert, delete, replace, swap of neighbours) that turn one text into the other. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const rows: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [
    i,
    ...Array<number>(y.length).fill(0),
  ]);
  for (let j = 0; j <= y.length; j++) {
    rows[0][j] = j;
  }
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[x.length][y.length];
}

function similarity(a: string, b: string): number {
  const longest = Math.max([...a].length, [...b].length);
  return longest ? 1 - editDistance(a, b) / longest : 0;
}

/** How alike a typed name and a stored name are, 0 to 1, on normalized text. */
export function nameScore(query: string, name: string): number {
  const q = tokensOf(query);
  const n = tokensOf(name);
  const typed = q.join('');
  const stored = n.join('');
  if (!typed || !stored) {
    return 0;
  }
  if (typed === stored) {
    return 1;
  }
  if ([...typed].length < MIN_QUERY_LENGTH) {
    return 0;
  }
  const scores = [
    similarity(typed, stored),
    similarity([...q].sort().join(''), [...n].sort().join('')),
  ];
  for (let start = 0; start + q.length <= n.length; start++) {
    scores.push(similarity(typed, n.slice(start, start + q.length).join('')));
  }
  if (q.length === 1 && n.some((token) => token.startsWith(typed))) {
    scores.push(0.85);
  }
  return Math.max(...scores);
}

/** The rows whose names are close enough to the query, closest first. */
export function rankSimilar<T>(
  query: string,
  rows: readonly T[],
  nameOf: (row: T) => string,
  limit = 5,
): T[] {
  return rows
    .map((row) => ({ row, name: nameOf(row), score: nameScore(query, nameOf(row)) }))
    .filter((entry) => entry.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.row);
}

/** Whether two names are the same once case, marks, spaces, punctuation and Arabic letter variants are ignored. */
export const sameName = (a: string, b: string): boolean => {
  const left = normalizeText(a);
  return !!left && left === normalizeText(b);
};

/**
 * `like` patterns that find names a typo may have missed: each word, its first three letters, its Arabic spelling
 * variants, and for Latin words their consonants in order (Leena finds Lina). The caller reads a capped page of
 * matches and ranks them.
 */
export function candidatePatterns(query: string): string[] {
  const words = query
    .split(/[\s\p{P}]+/u)
    .map((word) => word.replace(/[%_\\]/g, ''))
    .filter((word) => [...word].length >= 2);
  const terms = new Set<string>();
  for (const word of words) {
    terms.add(`%${word}%`);
    const letters = [...word];
    if (letters.length > 3) {
      terms.add(`%${letters.slice(0, 3).join('')}%`);
    }
    terms.add(`%${fold(word)}%`);
    terms.add(`%${word.replace(/ة/g, 'ه').replace(/ى/g, 'ي')}%`);
    terms.add(`%${word.replace(/ه/g, 'ة').replace(/ي/g, 'ى')}%`);
    const consonants = [...word.toLowerCase()].filter((c) => /[b-df-hj-np-tv-z]/.test(c));
    if (consonants.length >= 2 && /^[a-z]+$/i.test(word)) {
      terms.add(`%${consonants.join('%')}%`);
    }
  }
  return [...terms].slice(0, MAX_TERMS);
}

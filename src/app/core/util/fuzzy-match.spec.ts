import {
  CANDIDATE_CAP,
  SIMILARITY_THRESHOLD,
  candidatePatterns,
  candidatesOf,
  editDistance,
  findSameSpelled,
  nameScore,
  normalizeText,
  rankSimilar,
  sameName,
  samePatterns,
  tightPatterns,
} from './fuzzy-match';

describe('normalizeText', () => {
  it('lowercases Latin and drops spaces, punctuation and accents', () => {
    expect(normalizeText('  Lina  HADDAD-Khoury! ')).toBe('linahaddadkhoury');
    expect(normalizeText('José')).toBe('jose');
  });

  it.each([
    ['أحمد', 'احمد'],
    ['إسراء', 'اسراء'],
    ['آمال', 'امال'],
    ['مدرسة', 'مدرسه'],
    ['فتى', 'فتي'],
    ['مؤمن', 'مومن'],
    ['شائع', 'شايع'],
  ])('folds the Arabic variants %s and %s to one text', (a, b) => {
    expect(normalizeText(a)).toBe(normalizeText(b));
  });

  it('removes tatweel and harakat', () => {
    expect(normalizeText('مُحَمَّد')).toBe('محمد');
    expect(normalizeText('محـــمد')).toBe('محمد');
  });

  it('removes spaces and punctuation from Arabic names and reads Arabic digits', () => {
    expect(normalizeText('سامر، عودة')).toBe('سامرعوده');
    expect(normalizeText('مخزن ٣')).toBe('مخزن3');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, replacements and neighbour swaps', () => {
    expect(editDistance('lina', 'lina')).toBe(0);
    expect(editDistance('lina', 'lena')).toBe(1);
    expect(editDistance('leena', 'lina')).toBe(2);
    expect(editDistance('sammer', 'samer')).toBe(1);
    expect(editDistance('samre', 'samer')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('nameScore and rankSimilar', () => {
  const names = ['Lina Haddad', 'Samer Odeh', 'Omar Khoury', 'Green Clay', 'Olive Co'];
  const rank = (query: string) => rankSimilar(query, names, (n) => n);

  it('uses 0.6 as the threshold', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.6);
  });

  it('finds a first name with a vowel typo: Leena is Lina at exactly the threshold', () => {
    expect(nameScore('Leena', 'Lina Haddad')).toBeCloseTo(0.6);
    expect(rank('Leena')).toEqual(['Lina Haddad']);
  });

  it('ignores Latin case and punctuation', () => {
    expect(rank('SAMER-ODEH')).toEqual(['Samer Odeh']);
    expect(nameScore('samer odeh', 'Samer Odeh')).toBe(1);
  });

  it('finds a doubled letter, a swap and a missing letter in a full name', () => {
    expect(rank('Sammer Odeh')[0]).toBe('Samer Odeh');
    expect(rank('Smaer Odeh')[0]).toBe('Samer Odeh');
    expect(rank('Lina Hadad')[0]).toBe('Lina Haddad');
  });

  it('finds names typed in another order', () => {
    expect(rank('Odeh Samer')[0]).toBe('Samer Odeh');
  });

  it('finds an Arabic spelling variant of the stored name', () => {
    const arabic = ['أحمد الخطيب', 'مدرسة النور', 'سامر عودة'];
    expect(rankSimilar('احمد الخطيب', arabic, (n) => n)).toEqual(['أحمد الخطيب']);
    expect(rankSimilar('مدرسه النور', arabic, (n) => n)).toEqual(['مدرسة النور']);
    expect(rankSimilar('سامر عوده', arabic, (n) => n)).toEqual(['سامر عودة']);
  });

  it('finds an Arabic typo of one letter', () => {
    expect(rankSimilar('سمار عودة', ['سامر عودة', 'ليلى حداد'], (n) => n)).toEqual(['سامر عودة']);
  });

  it('keeps names below the threshold out: two edits in four letters is 0.5', () => {
    expect(nameScore('Omar', 'Amir')).toBeCloseTo(0.5);
    expect(rankSimilar('Amir', ['Omar Khoury'], (n) => n)).toEqual([]);
    expect(rank('Zed Quartz')).toEqual([]);
  });

  it('suggests nothing for a query shorter than three letters unless it is the name', () => {
    expect(nameScore('Li', 'Lia')).toBe(0);
    expect(nameScore('Li', 'li')).toBe(1);
  });

  it('puts the closest first, ties by name, and keeps at most the limit', () => {
    const rows = ['Lena', 'Lina', 'Lino', 'Lana', 'Luna', 'Lena B', 'Lenny'];
    const ranked = rankSimilar('Lina', rows, (n) => n, 3);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toBe('Lina');
    expect(ranked.slice(1)).toEqual(['Lana', 'Lena']);
  });
});

describe('sameName', () => {
  it('ignores case, spaces, punctuation and Arabic letter variants', () => {
    expect(sameName('Fig  Tree', 'fig-tree')).toBe(true);
    expect(sameName('شجرة تين', 'شجره تين')).toBe(true);
    expect(sameName('Fig tree', 'Fig trees')).toBe(false);
    expect(sameName('', '')).toBe(false);
  });
});

describe('candidatePatterns', () => {
  it('dedupes spelling variants that differ only in case', () => {
    expect(candidatePatterns('NOOR noor')).toEqual(['%NOOR%', '%NOO%', '%n%r%']);
  });

  it('searches each word, its first three letters and the consonants of a Latin word', () => {
    expect(candidatePatterns('Leena Hadad')).toEqual(
      expect.arrayContaining(['%Leena%', '%Lee%', '%l%n%', '%Hadad%', '%Had%', '%h%d%d%']),
    );
  });

  it('adds Arabic spelling variants and the folded form', () => {
    const patterns = candidatePatterns('مدرسه');
    expect(patterns).toEqual(expect.arrayContaining(['%مدرسه%', '%مدر%', '%مدرسة%']));
    expect(candidatePatterns('أحمد')).toContain('%احمد%');
  });

  it('leaves out short words and the consonant skeleton of words under four letters', () => {
    expect(candidatePatterns('Al Ali Noor')).not.toContain('%Al%');
    expect(candidatePatterns('Ali')).not.toContain('%l%');
    expect(candidatePatterns('Noor')).toContain('%n%r%');
  });

  it('drops wildcard characters and one-letter words, and caps the patterns', () => {
    expect(candidatePatterns('a %_ b')).toEqual([]);
    expect(candidatePatterns('100%')).toEqual(['%100%']);
    expect(candidatePatterns('alpha beta gamma delta epsilon zeta').length).toBeLessThanOrEqual(12);
  });
});

const matches = (pattern: string, name: string) =>
  new RegExp(pattern.split('%').join('.*'), 'i').test(name);

const encodedLength = (patterns: string[]) =>
  encodeURIComponent(JSON.stringify(patterns.map((p) => ['name', 'like', p]))).length;

describe('tightPatterns', () => {
  it('finds a twin stored with other spacing, whichever of the two was typed joined', () => {
    expect(tightPatterns('Al Noor Trading').some((p) => matches(p, 'AlNoor Trading'))).toBe(true);
    expect(tightPatterns('AlNoor Trading').some((p) => matches(p, 'Al Noor Trading'))).toBe(true);
    expect(tightPatterns('Al Noor Trading').some((p) => matches(p, 'Al-Noor  Trading'))).toBe(true);
  });

  it('keeps the first two and last two letters of each longer word, in order', () => {
    expect(tightPatterns('Al Noor Trading')).toEqual(['%Al%No%or%Tr%ng%']);
    expect(tightPatterns('Ali')).toEqual(['%Ali%']);
  });

  it('does not match an unrelated name', () => {
    expect(tightPatterns('Al Noor Trading').some((p) => matches(p, 'Green Clay'))).toBe(false);
  });

  it('adds the Arabic spelling variants once and no wildcards from the text', () => {
    expect(tightPatterns('مدرسة')).toEqual(['%مد%سة%', '%مد%سه%']);
    expect(tightPatterns('a_b%')).toEqual(['%a%b%']);
    expect(tightPatterns(' % ')).toEqual([]);
  });

  it('dedupes spelling variants that differ only in case', () => {
    expect(tightPatterns('Noor NOOR')).toHaveLength(1);
    expect(tightPatterns('NOOR')).toEqual(['%NO%OR%']);
  });
});

describe('samePatterns', () => {
  it('matches a name whatever its spacing, so a spaced and a joined spelling find each other', () => {
    const patterns = samePatterns('Al Noor Trading');
    expect(patterns.some((p) => matches(p, 'AlNoor Trading'))).toBe(true);
    expect(patterns.some((p) => matches(p, 'Al-Noor  Trading'))).toBe(true);
    expect(samePatterns('AlNoor').some((p) => matches(p, 'Al Noor'))).toBe(true);
  });

  it('includes the Arabic spelling variants and no wildcards from the text', () => {
    expect(samePatterns('مدرسة')).toEqual(expect.arrayContaining(['%م%د%ر%س%ة%', '%م%د%ر%س%ه%']));
    expect(samePatterns('a_b%')).toEqual(['%a%b%']);
    expect(samePatterns(' % ')).toEqual([]);
  });

  it('dedupes spelling variants that differ only in case', () => {
    expect(samePatterns('NOOR')).toEqual(['%N%O%O%R%']);
  });
});

describe('pattern length', () => {
  const long = Array.from({ length: 28 }, (_, i) => `مدرسة${'النور'.slice(0, (i % 4) + 1)}`)
    .join(' ')
    .slice(0, 140);

  it('caps every pattern at 24 letters and keeps the whole filter under 2000 encoded characters', () => {
    expect([...long]).toHaveLength(140);
    for (const patterns of [tightPatterns(long), samePatterns(long), candidatePatterns(long)]) {
      expect(patterns.length).toBeGreaterThan(0);
    }
    for (const patterns of [tightPatterns(long), samePatterns(long)]) {
      for (const pattern of patterns) {
        expect([...pattern.replace(/%/g, '')].length).toBeLessThanOrEqual(24);
      }
      expect(encodedLength(patterns)).toBeLessThan(2000);
    }
  });
});

describe('candidatesOf', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, i) => i);

  it('is capped only with more rows than the cap, and returns at most the cap', () => {
    expect(candidatesOf(rows(CANDIDATE_CAP))).toMatchObject({ capped: false });
    expect(candidatesOf(rows(CANDIDATE_CAP)).rows).toHaveLength(CANDIDATE_CAP);
    const over = candidatesOf(rows(CANDIDATE_CAP + 1));
    expect(over.capped).toBe(true);
    expect(over.rows).toHaveLength(CANDIDATE_CAP);
  });
});

describe('findSameSpelled', () => {
  it('stops after the narrow read when it finds a twin', async () => {
    const read = vi.fn().mockResolvedValue([{ name: 'AlNoor Trading' }, { name: 'Other' }]);
    const found = await findSameSpelled('Al Noor Trading', read);
    expect(found).toEqual({ rows: [{ name: 'AlNoor Trading' }], capped: false });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('falls back to the broad read, not capped at exactly the cap', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: CANDIDATE_CAP }, (_, i) => ({ name: `Ali ${i}` })),
      );
    const found = await findSameSpelled('Ali', read);
    expect(found.capped).toBe(false);
    expect(read).toHaveBeenLastCalledWith(samePatterns('Ali'), CANDIDATE_CAP + 1);
  });

  it('is capped when the broad read returns more than the cap', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: CANDIDATE_CAP + 1 }, (_, i) => ({ name: `Ali ${i}` })),
      );
    expect((await findSameSpelled('Ali', read)).capped).toBe(true);
  });

  it('reads nothing for a name with no letters', async () => {
    const read = vi.fn();
    expect(await findSameSpelled(' % ', read)).toEqual({ rows: [], capped: false });
    expect(read).not.toHaveBeenCalled();
  });
});

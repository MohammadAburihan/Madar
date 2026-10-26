import {
  SIMILARITY_THRESHOLD,
  candidatePatterns,
  editDistance,
  nameScore,
  normalizeText,
  rankSimilar,
  sameName,
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

  it('drops wildcard characters and one-letter words, and caps the patterns', () => {
    expect(candidatePatterns('a %_ b')).toEqual([]);
    expect(candidatePatterns('100%')).toEqual(['%100%']);
    expect(candidatePatterns('alpha beta gamma delta epsilon zeta').length).toBeLessThanOrEqual(12);
  });
});

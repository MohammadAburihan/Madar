import { joinAbout, splitAbout } from './contact-about';

describe('contact about text', () => {
  it('separates the About text from the Madar reference line', () => {
    expect(splitAbout('Sells pots\nand soil\n\nMadar contact CON-1')).toEqual({
      about: 'Sells pots\nand soil',
      marker: 'Madar contact CON-1',
    });
  });

  it('reads empty and reference-only details as no About', () => {
    expect(splitAbout(null)).toEqual({ about: '', marker: null });
    expect(splitAbout('Madar contact CON-1')).toEqual({ about: '', marker: 'Madar contact CON-1' });
  });

  it('keeps text that only mentions the words', () => {
    expect(splitAbout('Madar contact is Sam').about).toBe('Madar contact is Sam');
  });

  it('joins them again', () => {
    expect(joinAbout(' Pots ', 'Madar contact CON-1')).toBe('Pots\n\nMadar contact CON-1');
    expect(joinAbout('', null)).toBe('');
  });
});

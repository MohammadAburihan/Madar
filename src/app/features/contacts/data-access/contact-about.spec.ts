import { joinAbout, splitAbout } from './contact-about';

describe('contact about text', () => {
  it('separates the About text from the Madar reference line', () => {
    expect(splitAbout('Sells pots\nand soil\n\nMadar contact CON-0000001')).toEqual({
      about: 'Sells pots\nand soil',
      marker: 'Madar contact CON-0000001',
    });
  });

  it('reads empty and reference-only details as no About', () => {
    expect(splitAbout(null)).toEqual({ about: '', marker: null });
    expect(splitAbout('Madar contact CON-0000001')).toEqual({
      about: '',
      marker: 'Madar contact CON-0000001',
    });
  });

  it('keeps text that only mentions the words', () => {
    expect(splitAbout('Madar contact is Sam').about).toBe('Madar contact is Sam');
    expect(splitAbout('Madar contact Ahmed')).toEqual({
      about: 'Madar contact Ahmed',
      marker: null,
    });
  });

  it('takes the last real reference and keeps a look-alike line as text', () => {
    expect(splitAbout('Madar contact CON-FAKE\n\nMadar contact CON-0A1B2C3')).toEqual({
      about: 'Madar contact CON-FAKE',
      marker: 'Madar contact CON-0A1B2C3',
    });
  });

  it('joins them again', () => {
    expect(joinAbout(' Pots ', 'Madar contact CON-0000001')).toBe(
      'Pots\n\nMadar contact CON-0000001',
    );
    expect(joinAbout('', null)).toBe('');
  });
});

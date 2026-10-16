import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { KnownBusinessesService } from './known-businesses.service';

describe('KnownBusinessesService', () => {
  beforeEach(() => {
    localStorage.removeItem('madar.businesses');
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { location: { origin: 'https://rehan.example.com' } } },
      ],
    });
  });

  it('keeps other businesses’ addresses on the device, as origins', () => {
    const known = TestBed.inject(KnownBusinessesService);
    expect(known.add('padel.example.com/sign-in')).toBe('added');
    expect(known.add('https://padel.example.com')).toBe('known');
    expect(known.add('not an address')).toBe('invalid');
    expect(known.add('rehan.example.com')).toBe('current');
    expect(known.businesses()).toEqual([{ address: 'https://padel.example.com' }]);
    expect(JSON.parse(localStorage.getItem('madar.businesses')!)).toEqual([
      { address: 'https://padel.example.com' },
    ]);
    known.remove('https://padel.example.com');
    expect(known.businesses()).toEqual([]);
  });

  it('reads what an earlier visit saved, ignoring anything malformed', () => {
    localStorage.setItem(
      'madar.businesses',
      JSON.stringify([
        { address: 'https://issam.example.com' },
        { nope: 1 },
        { address: 'padel' },
        { address: 'javascript:alert(1)' },
      ]),
    );
    expect(TestBed.inject(KnownBusinessesService).businesses()).toEqual([
      { address: 'https://issam.example.com' },
    ]);
  });
});

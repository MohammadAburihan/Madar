import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: {}, ar: {} },
          translocoConfig: { availableLangs: ['en', 'ar'], defaultLang: 'en' },
        }),
      ],
    });
  });

  it('switches the document to RTL for Arabic and remembers the choice', async () => {
    const service = TestBed.inject(LanguageService);
    const html = TestBed.inject(DOCUMENT).documentElement;

    await service.use('ar');

    expect(html.dir).toBe('rtl');
    expect(html.lang).toBe('ar');
    expect(service.language()).toBe('ar');
    expect(localStorage.getItem('madar.language')).toBe('ar');
  });

  it('restores the stored language on init', async () => {
    localStorage.setItem('madar.language', 'ar');
    const service = TestBed.inject(LanguageService);

    await service.init();

    expect(service.language()).toBe('ar');
  });

  it('falls back to English for unknown stored values', async () => {
    localStorage.setItem('madar.language', 'fr');
    const service = TestBed.inject(LanguageService);

    await service.init();

    expect(service.language()).toBe('en');
    expect(TestBed.inject(DOCUMENT).documentElement.dir).toBe('ltr');
  });

  it('keeps the current language when another one fails to load', async () => {
    const service = TestBed.inject(LanguageService);
    const transloco = TestBed.inject(TranslocoService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(transloco, 'load').mockReturnValue(throwError(() => new Error('404')));

    await expect(service.use('ar')).resolves.toBeUndefined();

    expect(service.language()).toBe('en');
    expect(TestBed.inject(DOCUMENT).documentElement.dir).toBe('ltr');
  });

  it('still starts when the initial translations fail to load', async () => {
    const service = TestBed.inject(LanguageService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(TestBed.inject(TranslocoService), 'load').mockReturnValue(
      throwError(() => new Error('offline')),
    );

    await expect(service.init()).resolves.toBeUndefined();
    expect(service.language()).toBe('en');
  });

  it('applies the language picked last when loads finish out of order', async () => {
    const service = TestBed.inject(LanguageService);
    const transloco = TestBed.inject(TranslocoService);
    const slowArabic = new Subject<Record<string, string>>();
    vi.spyOn(transloco, 'load').mockImplementation((lang: string) =>
      lang === 'ar' ? slowArabic.asObservable() : of({}),
    );

    const arabic = service.use('ar');
    await service.use('en');
    slowArabic.next({});
    slowArabic.complete();
    await arabic;

    expect(service.language()).toBe('en');
    expect(localStorage.getItem('madar.language')).toBe('en');
  });
});

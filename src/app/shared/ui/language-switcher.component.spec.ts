import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from './language-switcher.component';

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        LanguageSwitcherComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: { language: { switchTo: 'Switch language to {{language}}' } } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
  });

  it('offers the other language by its own name', async () => {
    fixture.componentRef.setInput('language', 'en');
    await fixture.whenStable();

    const button: HTMLElement = fixture.nativeElement.querySelector('ion-button');
    expect(button.textContent?.trim()).toBe('العربية');
    expect(button.getAttribute('lang')).toBe('ar');
    expect(button.getAttribute('aria-label')).toBe('Switch language to العربية');
  });

  it('emits the target language when clicked', async () => {
    fixture.componentRef.setInput('language', 'ar');
    await fixture.whenStable();
    const emitted: string[] = [];
    fixture.componentInstance.languageChange.subscribe((language) => emitted.push(language));

    fixture.nativeElement.querySelector('ion-button').click();

    expect(emitted).toEqual(['en']);
  });
});

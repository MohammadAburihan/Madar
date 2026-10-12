import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { TranslocoPipe } from '@jsverse/transloco';
import { Language } from '../../core/i18n/language.service';

const ENDONYMS: Record<Language, string> = { en: 'English', ar: 'العربية' };

@Component({
  selector: 'app-language-switcher',
  imports: [IonButton, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-button
      fill="outline"
      size="small"
      [attr.lang]="target()"
      [attr.aria-label]="'language.switchTo' | transloco: { language: endonyms[target()] }"
      (click)="languageChange.emit(target())"
    >
      {{ endonyms[target()] }}
    </ion-button>
  `,
  styles: `
    ion-button {
      text-transform: none;
    }
  `,
})
export class LanguageSwitcherComponent {
  readonly language = input.required<Language>();
  readonly languageChange = output<Language>();

  protected readonly endonyms = ENDONYMS;
  protected readonly target = computed<Language>(() => (this.language() === 'ar' ? 'en' : 'ar'));
}

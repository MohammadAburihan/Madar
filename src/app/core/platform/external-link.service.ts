import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { NATIVE_PLATFORM } from './native-platform';

/** Opens an address outside Madar: a new tab on the web, an in-app browser in the apps. */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly document = inject(DOCUMENT);

  async open(url: string): Promise<void> {
    if (this.platform === 'web') {
      this.document.defaultView?.open(url, '_blank', 'noopener');
      return;
    }
    await Browser.open({ url });
  }
}

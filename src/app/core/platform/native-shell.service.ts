import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { filter, firstValueFrom } from 'rxjs';
import { NATIVE_PLATFORM } from './native-platform';

@Injectable({ providedIn: 'root' })
export class NativeShellService {
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly ionic = inject(Platform);
  private readonly router = inject(Router);

  get isNative(): boolean {
    return this.platform !== 'web';
  }

  async init(outlet: IonRouterOutlet): Promise<void> {
    if (!this.isNative) {
      return;
    }

    // Lowest priority so overlays and in-app navigation handle the back button first.
    this.ionic.backButton.subscribeWithPriority(-1, () => {
      if (!outlet.canGoBack()) {
        void App.exitApp();
      }
    });

    // Keep the splash until the first (lazy-loaded) page has rendered, not just the empty shell.
    await firstValueFrom(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    );
    requestAnimationFrame(() => void SplashScreen.hide().catch(() => undefined));
  }
}

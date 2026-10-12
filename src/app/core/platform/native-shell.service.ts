import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { NATIVE_PLATFORM } from './native-platform';

@Injectable({ providedIn: 'root' })
export class NativeShellService {
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly ionic = inject(Platform);

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

    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await SplashScreen.hide();
  }
}

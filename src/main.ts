import { bootstrapApplication } from '@angular/platform-browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  // The app hides the splash itself once rendered; if bootstrap fails, don't leave the phone stuck on it.
  void SplashScreen.hide().catch(() => undefined);
});

import type { CapacitorConfig } from '@capacitor/cli';

// Set by `npm run cap:sync:dev` so emulators can reach the local ERPNext over plain HTTP.
const nativeDev = process.env['MADAR_NATIVE_DEV'] === '1';

const config: CapacitorConfig = {
  appId: 'app.madar.mobile',
  appName: 'Madar',
  webDir: 'dist/madar/browser',
  server: nativeDev ? { cleartext: true } : undefined,
  plugins: {
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0f5c5c',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f5c5c',
    },
  },
};

export default config;

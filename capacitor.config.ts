import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.madar.mobile',
  appName: 'Madar',
  webDir: 'dist/madar/browser',
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

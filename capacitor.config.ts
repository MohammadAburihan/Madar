import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.madar.mobile',
  appName: 'Madar',
  webDir: 'dist/madar/browser',
  plugins: {
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0b5c56',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f7f6f2',
    },
  },
};

export default config;

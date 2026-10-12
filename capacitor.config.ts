import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.madar.mobile',
  appName: 'Madar',
  webDir: 'dist/madar/browser',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;

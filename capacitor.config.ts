import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uk.retireonsol.app',
  appName: 'RetireOnSol',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    loggingBehavior: 'production',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#0D0D0D00',
    },
    SystemBars: {
      insetsHandling: 'css',
    },
  },
};

export default config;

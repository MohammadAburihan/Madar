// Emulators can't reach the Mac's localhost directly; the Android emulator maps it to 10.0.2.2.
export const environment = {
  // Local ERPNext runs on plain http, on localhost or the emulator's 10.0.2.2.
  allowInsecureConnection: true,
  nativeErpnextUrl: { android: 'http://10.0.2.2:8080', ios: 'http://localhost:8080' } as Record<
    string,
    string
  >,
};

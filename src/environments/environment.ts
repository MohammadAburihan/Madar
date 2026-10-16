export const environment = {
  /** Release builds connect only to https business addresses. */
  allowInsecureConnection: false,
  nativeErpnextUrl: { android: '', ios: '' } as Record<string, string>,
};

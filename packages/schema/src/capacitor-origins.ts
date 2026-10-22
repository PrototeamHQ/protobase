/**
 * The origin Capacitor's WebView serves an app's files on, per platform. They hold because `protobase mobile` never
 * sets Capacitor's `server.hostname` or schemes.
 */
export const capacitorOrigin = { ios: 'capacitor://localhost', android: 'https://localhost' } as const

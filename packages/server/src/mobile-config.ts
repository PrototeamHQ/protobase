/** The `mobile` section of `protobase.config.ts`: with it, `protobase mobile` builds the app for iOS and Android. */
export type MobileConfig = {
  /** The app's id in reverse-DNS form, such as `com.example.shop`. */
  appId: string
  /** Extra native Capacitor plugins the app needs, as npm name → version range, such as `{ '@capacitor/camera': '^8.0.0' }`. */
  plugins?: Record<string, string>
}

/**
 * The origins Capacitor's WebView serves the app's files on: `capacitor://localhost` on iOS, `https://localhost` on
 * Android. They hold because `protobase mobile` never sets Capacitor's `server.hostname` or schemes.
 */
export const capacitorOrigins = ['capacitor://localhost', 'https://localhost']

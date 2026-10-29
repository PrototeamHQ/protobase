import { capacitorOrigin } from '@protobase/schema/internal'

/** The `mobile` section of `protobase.config.ts`: with it, `protobase mobile` builds the app for iOS and Android. */
export type MobileConfig = {
  /** The app's id on both iOS and Android, such as `com.example.shop`: two or more dot-separated parts, each a letter then letters and digits. */
  appId: string
  /** Extra native Capacitor plugins the app needs, as npm name → version range, such as `{ '@capacitor/camera': '^8.0.0' }`. */
  plugins?: Record<string, string>
  /**
   * The public key, PEM, of the RSA key in `PROTOBASE_MOBILE_SIGNING_KEY`, which `protobase mobile keys`
   * prints: with it the Android and iOS app update themselves, taking only releases signed with that key.
   */
  publicKey?: string
}

/** The origins Capacitor's WebView serves the app's files on: `capacitor://localhost` on iOS, `https://localhost` on Android. */
export const capacitorOrigins: string[] = Object.values(capacitorOrigin)

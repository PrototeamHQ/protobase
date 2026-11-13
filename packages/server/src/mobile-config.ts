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
  /**
   * The app's own home-screen icon, a path from the project's folder to a square PNG of at least 1024 pixels or a square
   * SVG, such as `'icon.png'`: `protobase mobile` makes every iOS and Android icon from it. Without it the app shows
   * Protobase's icon.
   */
  icon?: string
  /** The app's own splash screen, in place of its icon on its theme background. */
  splash?: MobileSplash
}

/**
 * The splash screen's image, centred, and its background, each optional: an image left out shows the app's icon, a
 * background left out the theme's. `dark` holds the values for dark mode; one left out there takes the light one.
 */
export type MobileSplash = MobileSplashLook & { dark?: MobileSplashLook }

/** A splash screen's look in light or dark mode. */
export type MobileSplashLook = {
  /**
   * A path from the project's folder to a square PNG of at least 1152 pixels or a square SVG, such as `'splash.png'`:
   * Android shows its middle circle of two thirds its side, so its content stays within it.
   */
  image?: string
  /** The background, an opaque colour such as `'#0d9488'`, `rgb()` or `hsl()`. */
  background?: string
}

/** The origins Capacitor's WebView serves the app's files on: `capacitor://localhost` on iOS, `https://localhost` on Android. */
export const capacitorOrigins: string[] = Object.values(capacitorOrigin)

import { cssColor, opaqueHex, type SplashColors } from './splash-colors'

/**
 * The background of the app's own icon, as `#rrggbb`: the config's `backgroundColor`, or without one the light
 * background of the splash screen, so the icon sits on the colour the app starts on.
 */
export const iconBackground = (backgroundColor: string | undefined, splash: SplashColors) => {
  if (backgroundColor === undefined) return splash.light
  const color = opaqueHex(cssColor(backgroundColor))
  if (!color) throw new Error(`backgroundColor in protobase.config.ts is ${backgroundColor}: mobile.icon needs it as an opaque sRGB colour, such as #ffffff, rgb() or hsl()`)
  return color
}

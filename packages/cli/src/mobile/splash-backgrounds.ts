import type { MobileSplash } from '@protobase/server'
import { cssColor, opaqueHex, type SplashColors } from './splash-colors'

// The setting's colour as `#rrggbb`; any other stops the build, naming the setting.
const nativeColor = (text: string, setting: string) => {
  const color = opaqueHex(cssColor(text))
  if (!color) throw new Error(`${setting} is ${text}: the splash screen needs an opaque sRGB colour, such as #0d9488, rgb() or hsl()`)
  return color
}

/**
 * The splash screen's background in light and dark mode: `mobile.splash.background` and `mobile.splash.dark.background`,
 * a dark one left out taking the light one, and without either the theme's, `theme`.
 */
export const splashBackgrounds = (splash: MobileSplash | undefined, theme: SplashColors): SplashColors => {
  const light = splash?.background === undefined ? undefined : nativeColor(splash.background, 'mobile.splash.background')
  const dark = splash?.dark?.background === undefined ? undefined : nativeColor(splash.dark.background, 'mobile.splash.dark.background')
  return { light: light ?? theme.light, dark: dark ?? light ?? theme.dark }
}

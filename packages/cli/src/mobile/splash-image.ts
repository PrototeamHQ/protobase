import type { MobileSplash } from '@protobase/server'
import { androidSplashImage, splashSourceSize } from './android-splash-image'
import { loadSharp } from './icon-sharp'
import { readSquareImage } from './icon-source'
import { iosSplashImage } from './ios-splash-image'
import type { Platform } from './platform'

/**
 * The files of the app's own splash image for the platform, `mobile.splash.image` and its dark one, drawn with the
 * sharp installed in the workspace `ws`; none without an image, when the splash shows the app's icon.
 */
export const splashImage = async ({ ws, projectDir, splash, platform }: { ws: string; projectDir: string; splash: MobileSplash | undefined; platform: Platform }) => {
  if (splash?.image === undefined) return
  const sharp = loadSharp(ws)
  const read = (file: string, setting: string) => readSquareImage(sharp, projectDir, file, { setting, noun: 'splash image', size: splashSourceSize })
  const light = await read(splash.image, 'mobile.splash.image')
  const dark = splash.dark?.image === undefined ? undefined : await read(splash.dark.image, 'mobile.splash.dark.image')
  const draw = platform === 'android' ? androidSplashImage : iosSplashImage
  return draw(sharp, light.image, dark?.image)
}

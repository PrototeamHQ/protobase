import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { iosSplashImagePoints } from './ios-splash-image'
import type { NativeFile } from './native-file'
import { copySplashFile, removeTemplateSplash, writeSplashFiles } from './native-splash'
import type { SplashColors } from './splash-colors'

const assets = 'App/App/Assets.xcassets'

/**
 * The launch screen files the template has, which Protobase's replace: the storyboard, Protobase's as a plain view in
 * the `SplashBackground` colour with the `Splash` image, the home-screen icon with its corners rounded, in its middle;
 * and that image.
 */
export const iosSplashFiles = ['App/App/Base.lproj/LaunchScreen.storyboard', `${assets}/Splash.imageset`]

/** The folder of the `SplashBackground` colour in the app's asset catalog. */
export const splashBackgroundSet = `${assets}/SplashBackground.colorset`

const component = (hex: string, at: number) => `0x${hex.slice(at, at + 2).toUpperCase()}`

const color = (hex: string) => ({ 'color-space': 'srgb', components: { red: component(hex, 1), green: component(hex, 3), blue: component(hex, 5), alpha: '1.000' } })

/** The asset catalog's `SplashBackground` colour: `light`, and `dark` in dark mode, so the launch screen follows the phone's. */
export const splashBackgroundContents = ({ light, dark }: SplashColors) => `${JSON.stringify({
  colors: [
    { color: color(light), idiom: 'universal' },
    { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: color(dark), idiom: 'universal' },
  ],
  info: { author: 'xcode', version: 1 },
}, null, 2)}\n`

// Protobase's storyboard draws the `Splash` image at 128 points: its size constraints and its design size.
const iconSize = ['constant="128"', 'width="128" height="128"']

/** Protobase's launch storyboard with the `Splash` image drawn at `points`; it fails on any other storyboard. */
export const withSplashImageSize = (storyboard: string, points: number) => {
  let sized = storyboard
  for (const size of iconSize) {
    if (sized.split(size).length !== 3) throw new Error("@protobase/mobile's LaunchScreen.storyboard does not draw the Splash image at 128 points, the size Protobase replaces")
    sized = sized.replaceAll(size, size.replaceAll('128', String(points)))
  }
  return sized
}

/**
 * Gives the iOS project in the workspace Protobase's launch screen on its background, `colors`, in place of
 * Capacitor's: the app's icon, or the app's own splash image, its `image` files, with them.
 */
export const withIosSplash = async (ws: string, colors: SplashColors, image?: NativeFile[]) => {
  for (const file of iosSplashFiles) {
    await removeTemplateSplash(ws, 'ios', file)
    await copySplashFile(ws, 'ios', file)
  }
  const set = path.join(ws, 'ios', splashBackgroundSet)
  await mkdir(set, { recursive: true })
  await writeFile(path.join(set, 'Contents.json'), splashBackgroundContents(colors))
  if (!image) return
  await writeSplashFiles(ws, 'ios', image)
  const storyboard = path.join(ws, 'ios', iosSplashFiles[0]!)
  await writeFile(storyboard, withSplashImageSize(await readFile(storyboard, 'utf8'), iosSplashImagePoints))
}

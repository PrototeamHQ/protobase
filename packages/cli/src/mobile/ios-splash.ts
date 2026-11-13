import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { copySplashFile, removeTemplateSplash } from './native-splash'
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

/** Gives the iOS project in the workspace Protobase's launch screen on the app's background in place of Capacitor's. */
export const withIosSplash = async (ws: string, colors: SplashColors) => {
  for (const file of iosSplashFiles) {
    await removeTemplateSplash(ws, 'ios', file)
    await copySplashFile(ws, 'ios', file)
  }
  const set = path.join(ws, 'ios', splashBackgroundSet)
  await mkdir(set, { recursive: true })
  await writeFile(path.join(set, 'Contents.json'), splashBackgroundContents(colors))
}

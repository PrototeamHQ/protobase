import { shownShare } from './android-splash-image'
import type { Sharp } from './icon-sharp'
import type { NativeFile } from './native-file'

const imageSet = 'App/App/Assets.xcassets/Splash.imageset'

/** The side, in points, the launch screen draws the app's own splash image at: the 192dp circle Android shows. */
export const iosSplashImagePoints = 192

const scales = [1, 2, 3]

const name = (scale: number, dark: boolean) => `splash${dark ? '-dark' : ''}${scale === 1 ? '' : `@${scale}x`}.png`

const entry = (scale: number, dark: boolean) => ({
  ...(dark && { appearances: [{ appearance: 'luminosity', value: 'dark' }] }),
  filename: name(scale, dark),
  idiom: 'universal',
  scale: `${scale}x`,
})

/** The `Splash` image set's Contents.json, with the dark appearance when the app has a dark image. */
export const splashImageContents = (dark: boolean) =>
  `${JSON.stringify({ images: [...scales.map((scale) => entry(scale, false)), ...(dark ? scales.map((scale) => entry(scale, true)) : [])], info: { author: 'xcode', version: 1 } }, null, 2)}\n`

const circleMask = (size: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`)

// The middle circle of the square `image` Android shows, at `size` pixels.
const shownCircle = async (sharp: Sharp, image: Buffer, size: number) => {
  const { width = 0 } = await sharp(image).metadata()
  const kept = Math.round(width * shownShare)
  const left = Math.floor((width - kept) / 2)
  return sharp(image).extract({ left, top: left, width: kept, height: kept }).resize(size, size).ensureAlpha().composite([{ input: circleMask(size), blend: 'dest-in' }]).png().toBuffer()
}

/**
 * The app's own iOS splash image, the `Splash` image set: the middle circle of the image Android shows, at 1x, 2x and
 * 3x of `iosSplashImagePoints`, and the dark image's beside it when there is one, so both platforms show the same.
 */
export const iosSplashImage = async (sharp: Sharp, light: Buffer, dark?: Buffer): Promise<NativeFile[]> => {
  const drawn = (image: Buffer, isDark: boolean) =>
    Promise.all(scales.map(async (scale) => ({ file: `${imageSet}/${name(scale, isDark)}`, content: await shownCircle(sharp, image, iosSplashImagePoints * scale) })))
  return [{ file: `${imageSet}/Contents.json`, content: splashImageContents(dark !== undefined) }, ...(await drawn(light, false)), ...(dark ? await drawn(dark, true) : [])]
}

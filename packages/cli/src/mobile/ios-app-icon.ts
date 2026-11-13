import type { IconSource } from './icon-source'
import type { Sharp } from './icon-sharp'
import type { NativeFile } from './native-file'

const iconSet = 'App/App/Assets.xcassets/AppIcon.appiconset'

/** The template's App Store icon, the one icon of its asset catalog, and that catalog's Contents.json. */
export const iosIconFile = `${iconSet}/AppIcon-512@2x.png`
export const iosIconContents = `${iconSet}/Contents.json`

const icon = (filename: string, appearance?: 'dark' | 'tinted') => ({
  ...(appearance && { appearances: [{ appearance: 'luminosity', value: appearance }] }),
  filename,
  idiom: 'universal',
  platform: 'ios',
  size: '1024x1024',
})

/** The AppIcon set's Contents.json with the dark and tinted appearances beside the template's one icon. */
export const appearancesContents = `${JSON.stringify({ images: [icon('AppIcon-512@2x.png'), icon('AppIcon-dark.png', 'dark'), icon('AppIcon-tinted.png', 'tinted')], info: { author: 'xcode', version: 1 } }, null, 2)}\n`

/** The launch screen's `Splash` image at 1x, 2x and 3x: 128 points, as the storyboard draws it. */
export const iosSplashImages = [
  ['App/App/Assets.xcassets/Splash.imageset/splash.png', 128],
  ['App/App/Assets.xcassets/Splash.imageset/splash@2x.png', 256],
  ['App/App/Assets.xcassets/Splash.imageset/splash@3x.png', 384],
] as const

// The share of an iOS icon's side its rounded corners take, as the home screen draws them.
const cornerRadius = 0.2237

const roundedMask = (size: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * cornerRadius}" fill="#fff"/></svg>`)

/**
 * The app's own iOS icon: the App Store icon flattened onto `background`, as it takes no alpha channel. A source with
 * transparency also gets the dark appearance, its mark on the transparent background iOS darkens, and the tinted one,
 * its greyscale; an opaque source gets neither, and iOS derives them from the icon.
 */
export const iosAppIcon = async (sharp: Sharp, { image, opaque }: IconSource, background: string): Promise<NativeFile[]> => {
  const files: NativeFile[] = [{ file: iosIconFile, content: await sharp(image).flatten({ background }).png().toBuffer() }]
  if (opaque) return files
  return [
    ...files,
    { file: `${iconSet}/AppIcon-dark.png`, content: image },
    { file: `${iconSet}/AppIcon-tinted.png`, content: await sharp(image).greyscale().png().toBuffer() },
    { file: iosIconContents, content: appearancesContents },
  ]
}

/** The launch screen's `Splash` image of the app's own icon: the App Store icon with its corners rounded. */
export const iosAppSplash = async (sharp: Sharp, { image }: IconSource, background: string): Promise<NativeFile[]> => {
  const flat = await sharp(image).flatten({ background }).png().toBuffer()
  return Promise.all(iosSplashImages.map(async ([file, size]) => ({ file, content: await sharp(flat).resize(size, size).ensureAlpha().composite([{ input: roundedMask(size), blend: 'dest-in' }]).png().toBuffer() })))
}

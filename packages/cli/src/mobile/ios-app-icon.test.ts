import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { iconPng, iconSource, pixel, sharp } from './icon-source-fixture'
import { appearancesContents, iosAppIcon, iosAppSplash, iosIconContents, iosIconFile, iosSplashImages } from './ios-app-icon'
import { templateFile } from './template-archive-fixture'

const splashDir = fileURLToPath(new URL('../../../mobile/splash/ios', import.meta.url))
const content = (files: Array<{ file: string; content: Buffer | string }>, file: string) => files.find((each) => each.file === file)!.content as Buffer

describe('iosAppIcon', () => {
  it('gives the App Store icon at the size the template has, flattened onto the background with no alpha channel', async () => {
    const files = await iosAppIcon(sharp, await iconSource(await iconPng(1024)), '#0d9488')
    const icon = content(files, iosIconFile)
    expect(pngSize(icon)).toEqual(pngSize(templateFile('ios', iosIconFile)))
    expect(icon[25], 'PNG colour type: truecolour without alpha').toBe(2)
    expect(await pixel(icon, 0, 0)).toEqual([13, 148, 136, 255])
  })

  it('adds the dark and tinted appearances of a source with transparency to the asset catalog', async () => {
    const files = await iosAppIcon(sharp, await iconSource(await iconPng(1024)), '#0d9488')
    expect(files.map(({ file }) => file)).toEqual([iosIconFile, 'App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-dark.png', 'App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-tinted.png', iosIconContents])
    const dark = content(files, 'App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-dark.png')
    expect(await pixel(dark, 0, 0)).toEqual([0, 0, 0, 0])
    const [r, g, b, alpha] = await pixel(content(files, 'App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-tinted.png'), 512, 512)
    expect([g, b, alpha]).toEqual([r, r, 255])
    const contents = JSON.parse(appearancesContents) as { images: Array<{ filename: string }>; info: unknown }
    const template = JSON.parse(templateFile('ios', iosIconContents).toString()) as { images: unknown[]; info: unknown }
    expect(contents.images[0]).toEqual(template.images[0])
    expect(contents.info).toEqual(template.info)
    for (const image of contents.images.slice(1)) expect(pngSize(content(files, `App/App/Assets.xcassets/AppIcon.appiconset/${image.filename}`))).toEqual({ width: 1024, height: 1024 })
  })

  it('gives an opaque source the App Store icon alone, for iOS to derive dark and tinted from', async () => {
    const files = await iosAppIcon(sharp, await iconSource(await iconPng(1024, 1024, { opaque: true })), '#0d9488')
    expect(files.map(({ file }) => file)).toEqual([iosIconFile])
  })
})

describe('iosAppSplash', () => {
  it("draws the launch screen's images at the sizes of Protobase's, the icon with its corners rounded", async () => {
    const files = await iosAppSplash(sharp, await iconSource(await iconPng(1024)), '#0d9488')
    expect(files.map(({ file }) => file)).toEqual(iosSplashImages.map(([file]) => file))
    for (const { file, content: image } of files) {
      const size = pngSize(image as Buffer)
      expect(size, file).toEqual(pngSize(readFileSync(path.join(splashDir, file))))
      expect(await pixel(image as Buffer, 0, 0), file).toEqual([0, 0, 0, 0])
      expect(await pixel(image as Buffer, size!.width / 2, 1), file).toEqual([13, 148, 136, 255])
    }
  })
})

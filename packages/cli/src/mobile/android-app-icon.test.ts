import { describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { adaptiveIconFiles, androidAppIcon, densityScales, launcherBackground, themedAdaptiveIcon } from './android-app-icon'
import { iconPng, iconSource, pixel, sharp } from './icon-source-fixture'
import { nativeIconFiles, templateIconFiles } from './native-icon'
import { templateFile } from './template-archive-fixture'

const content = (files: Array<{ file: string; content: Buffer | string }>, file: string) => files.find((each) => each.file === file)!.content
const monochrome = Object.keys(densityScales).map((density) => `app/src/main/res/mipmap-${density}/ic_launcher_monochrome.png`)

describe('androidAppIcon', () => {
  it("replaces each icon of the template at the template's size, and its background colour", async () => {
    const files = await androidAppIcon(sharp, await iconSource(await iconPng(1024, 1024, { opaque: true })), '#0d9488')
    expect(files.map(({ file }) => file).sort()).toEqual([...nativeIconFiles.android].sort())
    for (const { file, content: image } of files.filter(({ file }) => file.endsWith('.png'))) expect(pngSize(image as Buffer), file).toEqual(pngSize(templateFile('android', file)))
    expect(content(files, 'app/src/main/res/values/ic_launcher_background.xml')).toBe(launcherBackground('#0d9488'))
    expect(launcherBackground('#ffffff').trimEnd()).toBe(templateFile('android', 'app/src/main/res/values/ic_launcher_background.xml').toString().trimEnd())
  })

  it('flattens the legacy icon onto the background, cuts the round one to a circle and keeps the foreground in the safe zone', async () => {
    const files = await androidAppIcon(sharp, await iconSource(await iconPng(1024)), '#0d9488')
    const png = (file: string) => content(files, `app/src/main/res/mipmap-mdpi/${file}`) as Buffer
    expect(await pixel(png('ic_launcher.png'), 0, 0)).toEqual([13, 148, 136, 255])
    expect(await pixel(png('ic_launcher_round.png'), 0, 0)).toEqual([0, 0, 0, 0])
    expect(await pixel(png('ic_launcher_round.png'), 24, 1)).toEqual([13, 148, 136, 255])
    // At mdpi the 66 pixel safe zone starts 21 pixels in: the source's red circle, a quarter of its side in radius, fills its middle.
    const foreground = png('ic_launcher_foreground.png')
    expect(await pixel(foreground, 20, 54)).toEqual([0, 0, 0, 0])
    expect(await pixel(foreground, 54, 54)).toEqual([225, 29, 72, 255])
    expect(await pixel(foreground, 54, 54 - 18)).toEqual([0, 0, 0, 0])
  })

  it('gives a source with transparency a monochrome layer for themed icons', async () => {
    const files = await androidAppIcon(sharp, await iconSource(await iconPng(1024)), '#0d9488')
    expect(files.map(({ file }) => file).sort()).toEqual([...templateIconFiles.android, ...monochrome].sort())
    for (const file of monochrome) expect(content(files, file)).toEqual(content(files, file.replace('monochrome', 'foreground')))
    for (const file of adaptiveIconFiles) {
      expect(content(files, file)).toBe(themedAdaptiveIcon)
      expect(themedAdaptiveIcon.replace('    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n', '')).toBe(`${templateFile('android', file).toString()}\n`)
    }
  })
})

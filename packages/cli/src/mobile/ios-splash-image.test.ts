import { describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { splashSourceSize } from './android-splash-image'
import { iconPng, pixel, sharp } from './icon-source-fixture'
import { iosSplashImage, splashImageContents } from './ios-splash-image'

const set = 'App/App/Assets.xcassets/Splash.imageset'

describe('iosSplashImage', () => {
  it("draws the middle circle Android shows at 192 points, 1x to 3x, outside it transparent", async () => {
    const files = await iosSplashImage(sharp, await iconPng(splashSourceSize, splashSourceSize, { opaque: true }))
    expect(files.map(({ file }) => file)).toEqual([`${set}/Contents.json`, `${set}/splash.png`, `${set}/splash@2x.png`, `${set}/splash@3x.png`])
    expect(files[0]!.content).toBe(splashImageContents(false))
    expect(files.slice(1).map(({ content }) => pngSize(content as Buffer)?.width)).toEqual([192, 384, 576])
    const at3x = files[3]!.content as Buffer
    // The source's circle has a quarter of its side as radius, three eighths of the middle two thirds kept.
    expect(await pixel(at3x, 288, 288)).toEqual([225, 29, 72, 255])
    expect(await pixel(at3x, 288, 10)).toEqual([0, 0, 255, 255])
    expect((await pixel(at3x, 0, 0))[3]).toBe(0)
  })

  it('adds the dark image under the dark appearance', async () => {
    const files = await iosSplashImage(sharp, await iconPng(splashSourceSize), await iconPng(splashSourceSize))
    expect(files.map(({ file }) => file).slice(4)).toEqual([`${set}/splash-dark.png`, `${set}/splash-dark@2x.png`, `${set}/splash-dark@3x.png`])
    expect(files[0]!.content).toBe(splashImageContents(true))
  })
})

describe('splashImageContents', () => {
  it('names the images at each scale, and the dark ones under the dark appearance', () => {
    expect(JSON.parse(splashImageContents(true)).images).toEqual([
      { filename: 'splash.png', idiom: 'universal', scale: '1x' },
      { filename: 'splash@2x.png', idiom: 'universal', scale: '2x' },
      { filename: 'splash@3x.png', idiom: 'universal', scale: '3x' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'splash-dark.png', idiom: 'universal', scale: '1x' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'splash-dark@2x.png', idiom: 'universal', scale: '2x' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'splash-dark@3x.png', idiom: 'universal', scale: '3x' },
    ])
    expect(JSON.parse(splashImageContents(false)).images).toHaveLength(3)
  })
})

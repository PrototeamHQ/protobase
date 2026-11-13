import { describe, expect, it } from 'vitest'
import { pngSize } from '../build/app-icons'
import { androidSplashImage, androidSplashImageDrawable, splashSourceSize } from './android-splash-image'
import { iconPng, pixel, sharp } from './icon-source-fixture'

const res = 'app/src/main/res'

describe('androidSplashImage', () => {
  it('draws the image at 288dp at each density, with the plugin splash of it', async () => {
    const files = await androidSplashImage(sharp, await iconPng(splashSourceSize))
    expect(files.map(({ file }) => file)).toEqual([
      `${res}/drawable/protobase_splash.xml`,
      ...['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].map((density) => `${res}/drawable-${density}/protobase_splash_image.png`),
    ])
    expect(files[0]!.content).toBe(androidSplashImageDrawable)
    expect(pngSize(files[1]!.content as Buffer)).toEqual({ width: 288, height: 288 })
    expect(pngSize(files[5]!.content as Buffer)).toEqual({ width: 1152, height: 1152 })
    expect(await pixel(files[5]!.content as Buffer, 576, 576)).toEqual([225, 29, 72, 255])
  })

  it('puts the dark image under night beside each light one', async () => {
    const dark = await iconPng(splashSourceSize, splashSourceSize, { opaque: true })
    const files = await androidSplashImage(sharp, await iconPng(splashSourceSize), dark)
    const night = files.find(({ file }) => file === `${res}/drawable-night-xhdpi/protobase_splash_image.png`)!
    expect(pngSize(night.content as Buffer)).toEqual({ width: 576, height: 576 })
    expect(await pixel(night.content as Buffer, 0, 0)).toEqual([0, 0, 255, 255])
  })

  it("masks the plugin splash's image to its middle 192dp circle on the background", () => {
    expect(androidSplashImageDrawable).toContain('android:drawable="@drawable/protobase_splash_image"')
    expect(androidSplashImageDrawable).toContain('android:width="288dp"')
    // A 408dp ring 108dp wide leaves a 192dp circle and covers the 288dp image's corners.
    expect(androidSplashImageDrawable).toContain('android:width="408dp"')
    expect(androidSplashImageDrawable).toContain('android:width="108dp"')
  })
})

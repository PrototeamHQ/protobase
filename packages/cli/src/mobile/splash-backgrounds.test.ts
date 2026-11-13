import { describe, expect, it } from 'vitest'
import { splashBackgrounds } from './splash-backgrounds'

const theme = { light: '#f4f3ee', dark: '#0f0f11' }

describe('splashBackgrounds', () => {
  it("is the theme's without a setting", () => {
    expect(splashBackgrounds(undefined, theme)).toEqual(theme)
    expect(splashBackgrounds({ image: 'splash.png' }, theme)).toEqual(theme)
  })

  it('takes the light and dark backgrounds, as native colours', () => {
    expect(splashBackgrounds({ background: 'rgb(13 148 136)', dark: { background: 'black' } }, theme)).toEqual({ light: '#0d9488', dark: '#000000' })
  })

  it('takes the light background in dark mode without a dark one', () => {
    expect(splashBackgrounds({ background: '#0d9488' }, theme)).toEqual({ light: '#0d9488', dark: '#0d9488' })
  })

  it("keeps the theme's light background with only a dark one", () => {
    expect(splashBackgrounds({ dark: { background: '#042f2e' } }, theme)).toEqual({ light: '#f4f3ee', dark: '#042f2e' })
  })

  it('refuses a colour no splash screen can show, naming the setting', () => {
    expect(() => splashBackgrounds({ background: 'teal-ish' }, theme)).toThrow('mobile.splash.background is teal-ish: the splash screen needs an opaque sRGB colour')
    expect(() => splashBackgrounds({ dark: { background: 'rgb(0 0 0 / 50%)' } }, theme)).toThrow('mobile.splash.dark.background is rgb(0 0 0 / 50%)')
    expect(() => splashBackgrounds({ background: 'oklch(70% 0.1 180)' }, theme)).toThrow('mobile.splash.background is oklch(70% 0.1 180)')
  })
})

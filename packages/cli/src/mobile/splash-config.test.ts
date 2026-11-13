import { describe, expect, it } from 'vitest'
import { checkSplashConfig } from './splash-config'

describe('checkSplashConfig', () => {
  it('takes an image and a background, each with a dark one, and each optional', () => {
    const full = { image: 'splash.png', background: '#0d9488', dark: { image: 'splash-dark.png', background: '#042f2e' } }
    expect(checkSplashConfig(full)).toEqual(full)
    expect(checkSplashConfig({ background: '#0d9488' })).toEqual({ background: '#0d9488' })
    expect(checkSplashConfig({ dark: { background: '#042f2e' } })).toEqual({ dark: { background: '#042f2e' } })
    expect(checkSplashConfig({})).toEqual({})
  })

  it('refuses a section or a dark section that is no object', () => {
    expect(() => checkSplashConfig('splash.png')).toThrow('mobile.splash must be an object')
    expect(() => checkSplashConfig({ dark: '#000000' })).toThrow('mobile.splash.dark must be an object')
  })

  it('refuses an image or background that is no text, naming the setting', () => {
    expect(() => checkSplashConfig({ image: '' })).toThrow('mobile.splash.image must be the path of the splash image')
    expect(() => checkSplashConfig({ background: 7 })).toThrow('mobile.splash.background must be a colour')
    expect(() => checkSplashConfig({ image: 'a.png', dark: { image: 7 } })).toThrow('mobile.splash.dark.image must be the path')
    expect(() => checkSplashConfig({ dark: { background: '' } })).toThrow('mobile.splash.dark.background must be a colour')
  })

  it('refuses a dark image without a light one', () => {
    expect(() => checkSplashConfig({ dark: { image: 'splash-dark.png' } })).toThrow('mobile.splash.dark.image needs mobile.splash.image')
  })
})

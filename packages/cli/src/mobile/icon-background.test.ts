import { describe, expect, it } from 'vitest'
import { iconBackground } from './icon-background'

const splash = { light: '#f4f3ee', dark: '#1c1b18' }

describe('iconBackground', () => {
  it("takes the config's backgroundColor as #rrggbb", () => {
    expect(iconBackground('#0D9488', splash)).toBe('#0d9488')
    expect(iconBackground('white', splash)).toBe('#ffffff')
    expect(iconBackground('rgb(1, 2, 3)', splash)).toBe('#010203')
    expect(iconBackground('hsl(0 100% 50%)', splash)).toBe('#ff0000')
  })

  it("takes the splash screen's light background without one", () => {
    expect(iconBackground(undefined, splash)).toBe('#f4f3ee')
  })

  it('refuses a colour a native icon cannot take, naming the setting', () => {
    for (const color of ['oklch(0.7 0.1 200)', 'rgb(0 0 0 / 50%)', 'var(--x)', 'nonsense']) {
      expect(() => iconBackground(color, splash), color).toThrow(`backgroundColor in protobase.config.ts is ${color}: mobile.icon needs it as an opaque sRGB colour`)
    }
  })
})

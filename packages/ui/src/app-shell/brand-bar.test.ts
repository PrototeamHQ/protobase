import { describe, expect, it } from 'vitest'
import { brandContent, statusBarStyleOver } from './brand-bar'

describe('statusBarStyleOver', () => {
  it('asks for light text over a dark brand colour and dark text over a light one', () => {
    expect(statusBarStyleOver('rgb(37, 99, 235)')).toBe('DARK')
    expect(statusBarStyleOver('rgb(250, 204, 21)')).toBe('LIGHT')
    expect(statusBarStyleOver('rgb(255, 255, 255)')).toBe('LIGHT')
  })
})

describe('brandContent', () => {
  it("colours the bar's content with the theme's own brand foreground, redefining no theme variable", () => {
    expect(brandContent.split(' ')).toEqual(['text-primary-foreground', '[&_*]:text-primary-foreground', '[&_button:hover]:bg-primary-foreground/15'])
    expect(brandContent).not.toMatch(/\[--/)
  })
})

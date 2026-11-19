import { describe, expect, it } from 'vitest'
import { menuPagePath, menuPageInstead } from './menu-page'

describe('menuPageInstead', () => {
  it("opens the first tab rather than start on the sidebar's page", () => {
    expect(menuPageInstead(menuPagePath, '/home', { starting: true, morePage: true })).toBe('/home')
  })

  it("keeps the sidebar's page after the start while More page mode is on", () => {
    expect(menuPageInstead(menuPagePath, '/home', { starting: false, morePage: true })).toBeUndefined()
  })

  it("leaves the sidebar's page once More page mode is off, as on a desktop, for the home without a tab", () => {
    expect(menuPageInstead(menuPagePath, '/home', { starting: false, morePage: false })).toBe('/home')
    expect(menuPageInstead(menuPagePath, undefined, { starting: false, morePage: false })).toBe('/')
  })

  it('opens any other page as kept', () => {
    expect(menuPageInstead('/listings', '/home', { starting: true, morePage: false })).toBeUndefined()
  })
})

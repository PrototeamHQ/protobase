import { describe, expect, it } from 'vitest'
import { menuPagePath, startInstead } from './menu-page'

describe('startInstead', () => {
  it("opens the first tab rather than the sidebar's page", () => {
    expect(startInstead(menuPagePath, '/home')).toBe('/home')
  })

  it("opens any other page as kept, and the sidebar's page without a tab to go to", () => {
    expect(startInstead('/listings', '/home')).toBeUndefined()
    expect(startInstead(menuPagePath, undefined)).toBeUndefined()
  })
})

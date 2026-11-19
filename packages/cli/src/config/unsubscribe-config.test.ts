import { describe, expect, it } from 'vitest'
import { projectUnsubscribe, unsubscribeOn } from './unsubscribe-config'

describe('unsubscribe in the config', () => {
  it('takes only true or false', () => {
    expect(unsubscribeOn({})).toBe(false)
    expect(unsubscribeOn({ unsubscribe: true })).toBe(true)
    expect(() => unsubscribeOn({ unsubscribe: 'yes' as never })).toThrow('unsubscribe is "yes"; it takes true or false')
  })

  it("links to the app's URL, which it needs", () => {
    expect(projectUnsubscribe({ unsubscribe: true, url: 'https://shop.example.com' })).toEqual({ appUrl: 'https://shop.example.com' })
    expect(projectUnsubscribe({ unsubscribe: false, url: 'https://shop.example.com' })).toBeUndefined()
    expect(() => projectUnsubscribe({ unsubscribe: true })).toThrow(/public URL/)
  })
})

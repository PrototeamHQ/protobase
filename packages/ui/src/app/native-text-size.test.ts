import { describe, expect, it } from 'vitest'
import { applyNativeTextSize } from './native-text-size'

describe('applyNativeTextSize', () => {
  it('marks the iOS app for the system text size, and no other platform', () => {
    const ios = { dataset: {} as DOMStringMap }
    applyNativeTextSize(ios, 'ios')
    expect(ios.dataset.pbTextSize).toBe('system')
    const android = { dataset: {} as DOMStringMap }
    applyNativeTextSize(android, 'android')
    expect(android.dataset.pbTextSize).toBeUndefined()
  })
})

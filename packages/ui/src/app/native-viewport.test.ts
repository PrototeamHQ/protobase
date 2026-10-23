import { describe, expect, it } from 'vitest'
import { nativeViewport } from './native-viewport'

describe('nativeViewport', () => {
  it('keeps the page at a scale of one, its other settings as they were', () => {
    expect(nativeViewport('width=device-width, initial-scale=1, viewport-fit=cover')).toBe('width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1')
  })

  it('replaces a scale limit the page set', () => {
    expect(nativeViewport('width=device-width,maximum-scale=5')).toBe('width=device-width, maximum-scale=1')
  })
})

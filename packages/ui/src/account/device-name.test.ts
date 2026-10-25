import { describe, expect, it } from 'vitest'
import { deviceOf } from './device-name'

describe('deviceOf', () => {
  it('names the browser and system of common user agents', () => {
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')).toEqual({ browser: 'Chrome', system: 'macOS' })
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1')).toEqual({ browser: 'Safari', system: 'iPhone' })
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toEqual({ browser: 'Edge', system: 'Windows' })
    expect(deviceOf('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')).toEqual({ browser: 'Chrome', system: 'Android' })
    expect(deviceOf('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0')).toEqual({ browser: 'Firefox', system: 'Linux' })
  })

  it('leaves out what it does not know', () => {
    expect(deviceOf('curl/8.7.1')).toEqual({ browser: undefined, system: undefined })
    expect(deviceOf(undefined)).toEqual({})
  })
})

import { describe, expect, it } from 'vitest'
import { parseTtl } from './ttl'

describe('parseTtl', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['24h', 86_400],
  ])('%s -> %i seconds', (text, seconds) => {
    expect(parseTtl(text)).toBe(seconds)
  })

  it.each(['25h', '0m', '15', 'm', '1d', '-5m'])('rejects %s', (text) => {
    expect(() => parseTtl(text)).toThrow('--ttl')
  })
})

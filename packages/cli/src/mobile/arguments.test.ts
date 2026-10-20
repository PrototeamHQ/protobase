import { InvalidArgumentError } from 'commander'
import { describe, expect, it } from 'vitest'
import { parsePlatform, parsePort } from './arguments'

describe('parsePort', () => {
  it('takes a port as a number', () => {
    expect(parsePort('5173')).toBe(5173)
    expect(parsePort('1')).toBe(1)
    expect(parsePort('65535')).toBe(65535)
  })

  it('refuses anything else', () => {
    for (const value of ['5173@evil.com', '5173abc', '0x50', '1e3', ' 80', '80 ', '0', '65536', '-1', '']) {
      expect(() => parsePort(value), value).toThrow(InvalidArgumentError)
    }
  })
})

describe('parsePlatform', () => {
  it('takes ios or android only', () => {
    expect(parsePlatform('ios')).toBe('ios')
    expect(parsePlatform('android')).toBe('android')
    expect(() => parsePlatform('web')).toThrow('expected ios or android')
  })
})

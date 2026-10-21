import { InvalidArgumentError } from 'commander'
import { describe, expect, it } from 'vitest'
import { parseAppVersion, parseBuildNumber, parsePlatform, parsePort, parseSigningName, parseTeamId } from './arguments'

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

// Each value is written into native project files as given, so an accepted one comes back byte-equal and anything
// around it, such as a newline from CI interpolation, is refused.
const refuses = (parse: (value: string) => string, values: string[]) => {
  for (const value of values) expect(() => parse(value), JSON.stringify(value)).toThrow(InvalidArgumentError)
}

describe('parseAppVersion', () => {
  it('takes one to three dot-separated numbers as given', () => {
    for (const value of ['1', '1.2', '1.2.3', '10.0.123', '0.1']) expect(parseAppVersion(value)).toBe(value)
  })

  it('refuses anything else', () => {
    refuses(parseAppVersion, ['1.2.3.4', '1.a', '', '1.', '.1', 'v1.2', '1.2.3\n', ' 1.2.3', '1.2.3 ', '１.２', '1.2"', '1234567890'])
  })
})

describe('parseBuildNumber', () => {
  it('takes a whole number up to the highest Google Play versionCode', () => {
    for (const value of ['1', '7', '2100000000']) expect(parseBuildNumber(value)).toBe(value)
  })

  it('refuses anything else', () => {
    refuses(parseBuildNumber, ['0', '07', '2100000001', '99999999999', '7\n', '+7', '7e3', '0x10', '-1', '1.0', ''])
  })
})

describe('parseTeamId', () => {
  it('takes ten capital letters and digits', () => {
    expect(parseTeamId('ABCDE12345')).toBe('ABCDE12345')
  })

  it('refuses anything else', () => {
    refuses(parseTeamId, ['abcdefghij', 'ABCDE1234', 'ABCDE123456', 'ABCDE12345\n', 'ABCDE 2345', ''])
  })
})

describe('parseSigningName', () => {
  it('takes a certificate or profile name as given', () => {
    for (const value of ['Apple Distribution: Shop B.V. (ABCDE12345)', 'Shop App Store', '1b2c3d4e-0000-4000-8000-000000000000']) expect(parseSigningName(value)).toBe(value)
  })

  it('refuses markup, control characters and a leading dash', () => {
    refuses(parseSigningName, ['x</string><key>destination</key><string>upload', 'a<b', 'a>b', 'Shop & Co', 'a\nb', 'a\u0000b', '-exportPath', ''])
  })
})

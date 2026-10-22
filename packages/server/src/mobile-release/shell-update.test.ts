import { describe, expect, it } from 'vitest'
import { isShellVersion, shellUpdateRequired } from './shell-update'

describe('shellUpdateRequired', () => {
  it('is not below 1.0 on the same minor, and is on another minor', () => {
    expect(shellUpdateRequired('0.14.0', '0.14.2')).toBe(false)
    expect(shellUpdateRequired('0.14.3', '0.14.2')).toBe(false)
    expect(shellUpdateRequired('0.13.9', '0.14.2')).toBe(true)
    expect(shellUpdateRequired('0.15.0', '0.14.2')).toBe(true)
  })

  it('is not from 1.0 on the same major, and is on another major', () => {
    expect(shellUpdateRequired('1.0.0', '1.4.2')).toBe(false)
    expect(shellUpdateRequired('1.5.0', '1.4.2')).toBe(false)
    expect(shellUpdateRequired('0.14.2', '1.0.0')).toBe(true)
    expect(shellUpdateRequired('2.0.0', '1.4.2')).toBe(true)
  })

  it('takes x.y.z versions only', () => {
    expect(isShellVersion('0.14.2')).toBe(true)
    expect(isShellVersion('0.14')).toBe(false)
    expect(isShellVersion('0.14.2-beta')).toBe(false)
    expect(() => shellUpdateRequired('0.14', '0.14.2')).toThrow(/no x.y.z version/)
  })
})

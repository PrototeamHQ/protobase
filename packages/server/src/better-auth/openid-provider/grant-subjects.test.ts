import { describe, expect, it } from 'vitest'
import { deviceNameOf, grantSubject } from './grant-subjects'

describe('grantSubject', () => {
  it('is the same for one grant, whatever the secret, and another for another grant', async () => {
    const subject = await grantSubject('grant-1')
    expect(await grantSubject('grant-1')).toBe(subject)
    expect(await grantSubject('grant-2')).not.toBe(subject)
    expect(subject).not.toContain('grant-1')
    expect(subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('deviceNameOf', () => {
  it('is the name trimmed and cut to 64 characters, counting each character once', () => {
    expect(deviceNameOf(" Ana's phone ")).toBe("Ana's phone")
    expect(deviceNameOf('é'.repeat(70))).toBe('é'.repeat(64))
    expect(deviceNameOf('📱'.repeat(70))).toBe('📱'.repeat(64))
  })

  it('is none for nothing, blanks or another type', () => {
    expect(deviceNameOf(undefined)).toBeUndefined()
    expect(deviceNameOf('  ')).toBeUndefined()
    expect(deviceNameOf(42)).toBeUndefined()
  })
})

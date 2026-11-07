import { describe, expect, it } from 'vitest'
import { callPlugin, redactAlso } from './plugin-call'

describe('redactAlso', () => {
  it('blanks out each value, as written and URL-encoded, before the workflows\' own redaction', async () => {
    const redact = redactAlso(['k3y', 'a+b/c='], (text) => text.replaceAll('vault', '[secret]'))
    const outcome = await callPlugin(async () => { throw new Error('k3y a+b/c= a%2Bb%2Fc%3D vault') }, redact)
    expect(outcome).toEqual({ failed: '[redacted] [redacted] [redacted] [secret]' })
  })

  it('leaves a message alone when given no value to blank out', () => {
    expect(redactAlso([''], (text) => text)('as it was')).toBe('as it was')
  })
})

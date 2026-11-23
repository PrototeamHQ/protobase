import { describe, expect, it } from 'vitest'
import { senderAddressOf } from './sender-address-input'

describe('senderAddressOf', () => {
  it('trims and lowercases an address', () => {
    expect(senderAddressOf(' Billing@Acme.example ')).toBe('billing@acme.example')
  })

  it('refuses a line break, which would let the value add headers', () => {
    expect(senderAddressOf('billing@acme.example\r\nBcc: x@evil.example')).toBeUndefined()
    expect(senderAddressOf('billing@acme.example\nBcc: x@evil.example')).toBeUndefined()
  })

  it('refuses what is not an address', () => {
    expect(senderAddressOf('Billing <billing@acme.example>')).toBeUndefined()
    expect(senderAddressOf('billing')).toBeUndefined()
    expect(senderAddressOf(7)).toBeUndefined()
    expect(senderAddressOf(`${'a'.repeat(250)}@acme.example`)).toBeUndefined()
  })
})

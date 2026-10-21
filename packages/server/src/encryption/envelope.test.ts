import { describe, expect, it } from 'vitest'
import type { Binding } from './binding'
import { openText, UnreadableValue, type UnreadableKind } from './envelope-open'
import { Sealed, sealText } from './envelope-seal'
import { encryptionKeyring } from './keyring'

const keyA = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64')
const keyB = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString('base64')
const ring = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyA })
const binding: Binding = { schema: null, table: 'people', column: 'iban', tenant: 'a', key: ['7'] }
const subject = { resource: 'people', field: 'iban' }
const canary = 'NL91-CANARY-0001'
const sealed = (text = canary, on = binding) => Sealed.textOf(sealText(ring.current, on, text))

const failure = (stored: string, on = binding, keyring = ring) => {
  try {
    openText(keyring, on, stored, subject)
  } catch (error) {
    if (!(error instanceof UnreadableValue)) throw error
    expect(error.message).not.toContain(canary)
    expect(error.message).not.toContain(stored)
    return error.kind
  }
  throw new Error('expected the value not to open')
}

const [, , kid, payload] = sealed().split(':') as [string, string, string, string]
const bytes = Buffer.from(payload, 'base64url')
const withPayload = (data: Buffer) => `pbenc:1:${kid}:${data.toString('base64url')}`

describe('envelopes', () => {
  it('open with the binding and key they were sealed with, under a fresh IV each time', () => {
    expect(sealed()).toMatch(/^pbenc:1:[A-Za-z0-9_-]{8}:[A-Za-z0-9_-]+$/)
    expect(openText(ring, binding, sealed(), subject)).toBe(canary)
    expect(sealed()).not.toBe(sealed())
    const rotated = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyB, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: keyA })
    expect(openText(rotated, binding, sealed(), subject)).toBe(canary)
    expect(openText(ring, binding, sealed(''), subject)).toBe('')
  })

  it.each<[string, Partial<Binding>]>([
    ['column', { column: 'other' }],
    ['table', { table: 'cards' }],
    ['schema', { schema: 'public' }],
    ['tenant', { tenant: 'b' }],
    ['record key', { key: ['8'] }],
  ])('fail authentication under another %s', (_, change) => {
    expect(failure(sealed(), { ...binding, ...change })).toBe('failed-authentication')
  })

  it.each<[string, () => string, UnreadableKind]>([
    ['plaintext', () => canary, 'not-encrypted'],
    ['plaintext that starts like an envelope', () => `pbenc:1:${canary}`, 'malformed'],
    ['a 4-byte tag', () => withPayload(bytes.subarray(0, bytes.length - 12)), 'failed-authentication'],
    ['a payload under 28 bytes', () => withPayload(bytes.subarray(0, 27)), 'malformed'],
    ['an empty payload', () => `pbenc:1:${kid}:`, 'malformed'],
    ['non-canonical base64url', () => `pbenc:1:${kid}:${payload}=`, 'malformed'],
    ['standard base64', () => `pbenc:1:${kid}:${bytes.toString('base64')}x+/`, 'malformed'],
    ['an extra part', () => `${sealed()}:x`, 'malformed'],
    ['version 0', () => sealed().replace('pbenc:1:', 'pbenc:0:'), 'malformed'],
    ['version 2', () => sealed().replace('pbenc:1:', 'pbenc:2:'), 'malformed'],
    ['a 7-character kid', () => `pbenc:1:${kid.slice(1)}:${payload}`, 'malformed'],
    ['a 9-character kid', () => `pbenc:1:${kid}x:${payload}`, 'malformed'],
    ['an unknown kid', () => `pbenc:1:AAAAAAAA:${payload}`, 'unknown-key'],
  ])('refuse %s with no output', (_, stored, kind) => {
    expect(failure(stored())).toBe(kind)
  })

  it('refuse a kid edited to the current one', () => {
    const other = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyB })
    const foreign = Sealed.textOf(sealText(other.current, binding, canary))
    const both = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: keyA, PROTOBASE_ENCRYPTION_PREVIOUS_KEYS: keyB })
    expect(failure(foreign.replace(other.current.id, ring.current.id), binding, both)).toBe('failed-authentication')
  })

  it('name the field, record, key and kind in the error', () => {
    expect(() => openText(ring, { ...binding, tenant: 'b' }, sealed(), subject)).toThrow(`people.iban of record ["7"] cannot be decrypted: failed-authentication (key ${kid})`)
  })
})

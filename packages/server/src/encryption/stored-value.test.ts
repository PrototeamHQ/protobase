import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { pendingBinding } from './binding'
import { Sealed, sealText } from './envelope-seal'
import { encryptionKeyring } from './keyring'
import { storedValue } from './stored-value'

const people = resource('people').table('people').fields({ id: f.integer(), data: f.json().optional(), iban: f.text().optional().encrypted() }).primaryKey((r) => r.id).toModel()
const key = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: Buffer.alloc(32, 0).map((_, i) => i).toString('base64') }).current

describe('storedValue', () => {
  const iban = people.fields.iban!

  it('refuses an unsealed value for an encrypted field without naming it', () => {
    expect(() => storedValue(iban, 'NL91-SECRET')).toThrow('"iban" is encrypted, and its value was not sealed')
    expect(() => storedValue(iban, 'NL91-SECRET')).not.toThrow('NL91-SECRET')
  })

  it('writes a sealed value as its envelope, and null as null', () => {
    const sealed = sealText(key, pendingBinding(people, iban), 'NL91')
    expect(storedValue(iban, sealed)).toBe(Sealed.textOf(sealed))
    expect(storedValue(iban, null)).toBeNull()
  })

  it('writes json as text, as before', () => {
    expect(storedValue(people.fields.data!, { a: 1 })).toBe('{"a":1}')
    expect(storedValue(people.fields.data!, null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { encrypted, f, resource } from '@protobase/schema'
import { pendingBinding } from './binding'
import { openText } from './envelope-open'
import { Sealed } from './envelope-seal'
import { encryptionKeyring } from './keyring'
import { encryptedValuesOf, hasEncryptedValues, sealValues } from './seal-values'

const people = resource('people').table('people').fields({ id: f.integer(), name: f.text(), iban: f.text().optional().encrypted() }).primaryKey((r) => r.id).toModel()
const runtime = { keyring: encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: Buffer.alloc(32, 0).map((_, i) => i).toString('base64') }) }
const bind = (field: (typeof people.fields)[string]) => pendingBinding(people, field)

describe('sealValues', () => {
  it('seals encrypted values, keeps null and passes other fields through', () => {
    const values = sealValues(runtime, people, { name: 'a', iban: 'NL91' }, bind)
    expect(values.name).toBe('a')
    expect(values.iban).toBeInstanceOf(Sealed)
    expect(openText(runtime.keyring, bind(people.fields.iban!), Sealed.textOf(values.iban as Sealed), { resource: 'people', field: 'iban' })).toBe('NL91')
    expect(sealValues(runtime, people, { iban: null }, bind)).toEqual({ iban: null })
  })

  it('seals a client-sent envelope again rather than storing it', () => {
    const first = Sealed.textOf(sealValues(runtime, people, { iban: 'NL91' }, bind).iban as Sealed)
    const again = Sealed.textOf(sealValues(runtime, people, { iban: first }, bind).iban as Sealed)
    expect(openText(runtime.keyring, bind(people.fields.iban!), again, { resource: 'people', field: 'iban' })).toBe(first)
  })

  it('throws on a value that is no text, and without a runtime', () => {
    expect(() => sealValues(runtime, people, { iban: encrypted }, bind)).toThrow('"iban" is encrypted and takes text only')
    expect(() => sealValues(runtime, people, { iban: 5 }, bind)).toThrow('takes text only')
    expect(() => sealValues(undefined, people, { iban: 'x' }, bind)).toThrow('no encryption runtime')
    expect(sealValues(undefined, people, { name: 'x', iban: null }, bind)).toEqual({ name: 'x', iban: null })
  })

  it('tells which values set an encrypted field', () => {
    expect(hasEncryptedValues(people, { name: 'a', iban: null })).toBe(false)
    expect(hasEncryptedValues(people, { iban: 'x' })).toBe(true)
    expect(encryptedValuesOf(people, { name: 'a', iban: 'x' })).toEqual({ iban: 'x' })
  })
})

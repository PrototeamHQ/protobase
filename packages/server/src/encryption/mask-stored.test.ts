import { describe, expect, it } from 'vitest'
import { encrypted, f, resource } from '@protobase/schema'
import { maskEncrypted } from './mask-stored'

const people = resource('people').table('people').fields({ id: f.integer(), iban: f.text().optional().encrypted(), token: f.text().optional().encrypted(), name: f.text() }).primaryKey((r) => r.id).toModel()
const plain = resource('plain').table('plain').fields({ id: f.integer(), note: f.text().sensitive() }).primaryKey((r) => r.id).toModel()

describe('maskEncrypted', () => {
  it('replaces a set encrypted field by the marker, keeps an empty one null and an absent one absent', () => {
    expect(maskEncrypted(people, { id: 1, iban: 'pbenc:1:x', token: null, name: 'a' })).toEqual({ id: 1, iban: encrypted, token: null, name: 'a' })
    expect(maskEncrypted(people, { id: 1, name: 'a' })).toEqual({ id: 1, name: 'a' })
  })

  it('returns the same row for a model without encrypted fields', () => {
    const row = { id: 1, note: 'x' }
    expect(maskEncrypted(plain, row)).toBe(row)
  })
})

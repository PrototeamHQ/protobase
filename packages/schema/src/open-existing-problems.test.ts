import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'

const directMessages = resource('direct_messages')
  .table('direct_messages')
  .fields({ id: f.integer().readOnly(), tenant_id: f.integer(), member_key: f.text().readOnly(), secret: f.text().encrypted(), photo: f.file() })
  .primaryKey((r) => r.id)

describe('.openExisting()', () => {
  it('puts the unique key in the model, in order', () => {
    expect(directMessages.openExisting((r) => [r.tenant_id, r.member_key]).toModel().openExisting).toEqual(['tenant_id', 'member_key'])
  })

  it('leaves it out of a model without it', () => {
    expect(directMessages.toModel()).not.toHaveProperty('openExisting')
  })

  it('refuses an empty key, an encrypted or file field and a field given twice', () => {
    expect(() => directMessages.openExisting(() => []).toModel()).toThrow('openExisting names no field')
    expect(() => directMessages.openExisting((r) => [r.secret]).toModel()).toThrow('openExisting field "secret" is encrypted')
    expect(() => directMessages.openExisting((r) => [r.photo]).toModel()).toThrow('openExisting field "photo" is a file field')
    expect(() => directMessages.openExisting((r) => [r.tenant_id, r.tenant_id]).toModel()).toThrow('openExisting field "tenant_id" is given twice')
  })
})

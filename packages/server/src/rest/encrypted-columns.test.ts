import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { refuseEncryptedReads, refuseEncryptedWrite, refuseRebinding } from './encrypted-columns'
import { parseFilter } from './parse-filter'
import { parseOrder } from './parse-order'
import { RestError } from './rest-error'

const people = resource('people')
  .table('people')
  .fields({ id: f.integer(), org: f.text().column('org_id'), name: f.text(), iban: f.text().encrypted().column('iban_text') })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)
  .toModel()
const plain = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).toModel()

const bodyOf = (run: () => void) => {
  try {
    run()
  } catch (thrown) {
    if (!(thrown instanceof RestError)) throw thrown
    return thrown.body
  }
  return undefined
}

describe('refuseEncryptedReads', () => {
  it('refuses a filter, also nested, a sort or a join on an encrypted column', () => {
    expect(bodyOf(() => refuseEncryptedReads(people, [parseFilter('iban_text', 'eq.NL')], []))).toEqual({
      code: 'encrypted-column',
      details: null,
      hint: 'Write and reveal encrypted fields through /api/v1',
      message: "Column 'iban_text' of 'people' is encrypted: it cannot be filtered, sorted or joined on here",
    })
    expect(bodyOf(() => refuseEncryptedReads(people, [parseFilter('or', '(name.eq.a,iban_text.eq.b)')], []))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseEncryptedReads(people, [], parseOrder('iban_text.desc')))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseEncryptedReads(people, [], [], ['iban_text']))?.code).toBe('encrypted-column')
  })

  it('lets other columns through', () => {
    expect(bodyOf(() => refuseEncryptedReads(people, [parseFilter('name', 'eq.a')], parseOrder('id'), ['org_id']))).toBeUndefined()
  })
})

describe('refuseEncryptedWrite', () => {
  it('refuses writing an encrypted column, by its column name', () => {
    expect(bodyOf(() => refuseEncryptedWrite(people, ['name', 'iban_text']))?.message).toBe("Column 'iban_text' of 'people' is encrypted: it cannot be written or matched on here")
    expect(bodyOf(() => refuseEncryptedWrite(people, ['name', 'id', 'org_id']))).toBeUndefined()
  })
})

describe('refuseRebinding', () => {
  it('refuses changing the key or tenant of a table with encrypted fields', () => {
    expect(bodyOf(() => refuseRebinding(people, ['id']))?.message).toBe("Column 'id' of 'people' cannot change here: its encrypted fields are bound to it")
    expect(bodyOf(() => refuseRebinding(people, ['name', 'org_id']))?.code).toBe('encrypted-column')
  })

  it('lets an upsert write the columns it matches on, and a table without encrypted fields change its key', () => {
    expect(bodyOf(() => refuseRebinding(people, ['id', 'org_id', 'name'], ['id', 'org_id']))).toBeUndefined()
    expect(bodyOf(() => refuseRebinding(people, ['id', 'name'], ['id']))).toBeUndefined()
    expect(bodyOf(() => refuseRebinding(plain, ['id']))).toBeUndefined()
  })
})

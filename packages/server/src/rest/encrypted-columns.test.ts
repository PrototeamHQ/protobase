import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { guardedTable, refuseEncryptedReads, refuseEncryptedWrite, refuseRebinding } from './encrypted-columns'
import { parseFilter } from './parse-filter'
import { parseOrder } from './parse-order'
import { RestError } from './rest-error'

const people = resource('people')
  .table('people')
  .fields({ id: f.integer(), org: f.text().column('org_id'), name: f.text(), iban: f.text().encrypted().column('iban_text') })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)
  .toModel()
const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).toModel()
// A second resource over people that leaves the encrypted column out, declared first.
const peopleAdmin = resource('people_admin').table('public.people').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const models = [peopleAdmin, people, notes]
const table = guardedTable(people, models)
const plain = guardedTable(notes, models)

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
    expect(bodyOf(() => refuseEncryptedReads(table, [parseFilter('iban_text', 'eq.NL')], []))).toEqual({
      code: 'encrypted-column',
      details: null,
      hint: 'Write and reveal encrypted fields through /api/v1',
      message: "Column 'iban_text' of 'people' is encrypted: it cannot be filtered, sorted or joined on here",
    })
    expect(bodyOf(() => refuseEncryptedReads(table, [parseFilter('or', '(name.eq.a,iban_text.eq.b)')], []))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseEncryptedReads(table, [], parseOrder('iban_text.desc')))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseEncryptedReads(table, [], [], ['iban_text']))?.code).toBe('encrypted-column')
  })

  it('lets other columns through', () => {
    expect(bodyOf(() => refuseEncryptedReads(table, [parseFilter('name', 'eq.a')], parseOrder('id'), ['org_id']))).toBeUndefined()
  })
})

describe('refuseEncryptedWrite', () => {
  it('refuses writing an encrypted column, by its column name', () => {
    expect(bodyOf(() => refuseEncryptedWrite(table, ['name', 'iban_text']))?.message).toBe("Column 'iban_text' of 'people' is encrypted: it cannot be written or matched on here")
    expect(bodyOf(() => refuseEncryptedWrite(table, ['name', 'id', 'org_id']))).toBeUndefined()
  })
})

describe('refuseRebinding', () => {
  it('refuses changing the key or tenant of a table with encrypted fields', () => {
    expect(bodyOf(() => refuseRebinding(table, ['id']))?.message).toBe("Column 'id' of 'people' cannot change here: its encrypted fields are bound to it")
    expect(bodyOf(() => refuseRebinding(table, ['name', 'org_id']))?.code).toBe('encrypted-column')
  })

  it('lets an upsert write the columns it matches on, and a table without encrypted fields change its key', () => {
    expect(bodyOf(() => refuseRebinding(table, ['id', 'org_id', 'name'], ['id', 'org_id']))).toBeUndefined()
    expect(bodyOf(() => refuseRebinding(table, ['id', 'name'], ['id']))).toBeUndefined()
    expect(bodyOf(() => refuseRebinding(plain, ['id']))).toBeUndefined()
  })
})

describe('guardedTable', () => {
  it('guards a table by every resource over it, also when the one served leaves the encrypted column out', () => {
    const served = guardedTable(peopleAdmin, models)
    expect(served.models).toEqual([peopleAdmin, people])
    expect(bodyOf(() => refuseEncryptedWrite(served, ['iban_text']))?.message).toBe("Column 'iban_text' of 'people' is encrypted: it cannot be written or matched on here")
    expect(bodyOf(() => refuseEncryptedReads(served, [parseFilter('iban_text', 'eq.NL')], []))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseRebinding(served, ['org_id']))?.code).toBe('encrypted-column')
    expect(bodyOf(() => refuseRebinding(served, ['id']))?.code).toBe('encrypted-column')
  })
})

import { describe, expect, it } from 'vitest'
import type { DbColumn, DbIndex, DbTable } from '../db/model'
import { renderDataFile } from './data-file'
import { planResource, proposeAll } from './resource-plan'

const column = (name: string, typeName: string): DbColumn => ({
  name,
  position: 1,
  typeName,
  formatted: typeName,
  isEnum: false,
  enumValues: [],
  notNull: true,
  identity: false,
  identityAlways: false,
  generated: false,
})

const primary: DbIndex = { name: 'people_pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: ['int4_ops'] }
const trigram = (name: string, partial = false): DbIndex => ({ name: `people_${name}_trgm`, columns: [name], unique: false, primary: false, partial, method: 'gin', opclasses: ['gin_trgm_ops'] })

const table = (indexes: DbIndex[], columns = [column('id', 'int4'), column('email', 'text'), column('name', 'text')]): DbTable => ({
  schema: 'crm',
  name: 'people',
  kind: 'table',
  columns,
  foreignKeys: [],
  checks: [],
  indexes: [primary, ...indexes],
})

const rendered = (db: DbTable) => {
  const decisions = proposeAll(db, { table: db, resourceNameOf: (_, name) => name }).map((proposal) => ({ proposal, ignored: false }))
  return renderDataFile(planResource('people', db, decisions)!)
}

describe('renderDataFile', () => {
  it("searches a resource by the field that names its records, when a pg_trgm index serves it", () => {
    expect(rendered(table([trigram('name')]))).toContain('  .search((r) => [r.name])\n')
    expect(rendered(table([trigram('title')], [column('id', 'int4'), column('code', 'text'), column('title', 'text')]))).toContain('.search((r) => [r.title])')
  })

  it('leaves the search out without such an index, as the API would refuse it', () => {
    expect(rendered(table([]))).not.toContain('.search(')
    expect(rendered(table([trigram('name', true)]))).not.toContain('.search(')
    expect(rendered(table([{ ...trigram('name'), method: 'btree', opclasses: ['text_ops'] }]))).not.toContain('.search(')
    // An index on another text field does not make the title searchable
    expect(rendered(table([trigram('email')]))).not.toContain('.search(')
  })
})

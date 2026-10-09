import { describe, expect, it } from 'vitest'
import type { DbTable } from '../db/model'
import { f, resource } from '@protobase/schema'
import { checkResource } from './check'

const table: DbTable = {
  schema: 'shop',
  name: 'items',
  columns: [
    { name: 'id', position: 1, typeName: 'int4', formatted: 'integer', isEnum: false, enumValues: [], notNull: true, identity: false, identityAlways: false, generated: false },
    { name: 'title', position: 2, typeName: 'text', formatted: 'text', isEnum: false, enumValues: [], notNull: true, identity: false, identityAlways: false, generated: false },
  ],
  foreignKeys: [],
  checks: [],
  indexes: [{ name: 'items_pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree' }],
}

const model = (fields: Parameters<ReturnType<typeof resource>['fields']>[0], key = 'id') =>
  resource('items')
    .table('shop.items')
    .fields(fields)
    .primaryKey((r) => (r as Record<string, never>)[key]!)
    .toModel()

describe('checkResource', () => {
  it('passes a matching resource', () => {
    expect(checkResource(model({ id: f.integer(), title: f.text() }), [table])).toEqual([])
  })

  it('reports a missing table', () => {
    const [issue] = checkResource(model({ id: f.integer() }), [])
    expect(issue).toMatchObject({ severity: 'error', message: 'table shop.items does not exist' })
  })

  it('reports missing columns and type mismatches', () => {
    const issues = checkResource(model({ id: f.text(), ghost: f.text() }), [table])
    expect(issues.map((i) => i.message)).toEqual([
      'id: declared text, but id is integer',
      'ghost: column "ghost" does not exist in shop.items',
    ])
  })

  it('suggests an index for filterable fields without one', () => {
    const [issue] = checkResource(model({ id: f.integer(), title: f.text().filterable() }), [table])
    expect(issue).toMatchObject({
      severity: 'warning',
      suggestion: 'CREATE INDEX ON shop.items (title);',
    })
  })

  it('flags database defaults the field does not declare, and the reverse', () => {
    const withDefault = { ...table, columns: [{ ...table.columns[0]!, defaultExpr: 'nextval(...)' }, table.columns[1]!] }
    const [missing] = checkResource(model({ id: f.integer(), title: f.text() }), [withDefault])
    expect(missing).toMatchObject({ severity: 'warning', message: expect.stringContaining('add .dbDefault()') })
    expect(checkResource(model({ id: f.integer().dbDefault(), title: f.text() }), [withDefault])).toEqual([])
    const [extra] = checkResource(model({ id: f.integer(), title: f.text().dbDefault() }), [table])
    expect(extra).toMatchObject({ severity: 'warning', message: expect.stringContaining('no default') })
  })

  it('reports tables without a usable key', () => {
    const keyless = { ...table, indexes: [] }
    const issues = checkResource(model({ id: f.integer() }), [keyless])
    expect(issues[0]).toMatchObject({ severity: 'error', message: 'shop.items has no primary key or unique NOT NULL index' })
  })

  it('reports a configured key that is not unique', () => {
    const issues = checkResource(model({ id: f.integer(), title: f.text() }, 'title'), [table])
    expect(issues[0]).toMatchObject({ message: 'primary key (title) is not backed by a unique index' })
  })
})

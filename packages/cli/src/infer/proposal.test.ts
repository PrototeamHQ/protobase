import { describe, expect, it } from 'vitest'
import type { DbColumn, DbTable } from '../db/model'
import { proposeField } from './proposal'
import { renderField } from './render-field'

const column = (name: string, typeName: string, extra: Partial<DbColumn> = {}): DbColumn => ({
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
  ...extra,
})

const table = (columns: DbColumn[]): DbTable => ({
  schema: 'shop',
  name: 'orders',
  kind: 'table',
  columns,
  foreignKeys: [],
  checks: [],
  indexes: [{ name: 'orders_pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree' }],
})

const render = (columns: DbColumn[], name: string) => {
  const t = table(columns)
  const field = proposeField(t, t.columns.find((c) => c.name === name)!, { table: t, resourceNameOf: (_s, n) => n })
  return renderField(field)
}

const columns = [
  column('id', 'uuid', { defaultExpr: 'uuidv7()' }),
  column('seq', 'int4', { identity: true }),
  column('created_at', 'timestamptz', { defaultExpr: 'now()' }),
  column('modified_at', 'timestamptz', { defaultExpr: 'now()' }),
  column('order_date', 'date', { defaultExpr: 'CURRENT_DATE' }),
  column('status', 'text', { defaultExpr: "'new'::text" }),
  column('total', 'numeric', { formatted: 'numeric(10,2)', generated: true, defaultExpr: '(a * b)' }),
  column('ref', 'int4', { identity: true, identityAlways: true }),
]

describe('database defaults', () => {
  it.each([
    ['id', 'f.uuid().dbDefault().readOnly().filterable().sortable()'],
    ['seq', 'f.integer().dbDefault().readOnly()'],
    ['created_at', 'f.timestamp().dbDefault().readOnly()'],
    ['modified_at', 'f.timestamp().dbDefault().readOnly()'],
    ['order_date', 'f.date().dbDefault()'],
    ['status', "f.text().default('new')"],
    ['total', 'f.decimal({ precision: 10, scale: 2 }).readOnly()'],
    ['ref', 'f.integer().readOnly()'],
  ])('%s -> %s', (name, expected) => {
    expect(render(columns, name)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import type { DbColumn, DbIndex, DbTable } from '../db/model'
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
  indexes: [{ name: 'orders_pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: ['int4_ops'] }],
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
  column('createdAt', 'timestamptz', { defaultExpr: 'now()' }),
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
    ['createdAt', "f.timestamp().dbDefault().readOnly().column('createdAt')"],
    ['order_date', 'f.date().dbDefault()'],
    ['status', "f.text().default('new')"],
    ['total', 'f.decimal({ precision: 10, scale: 2 }).readOnly()'],
    ['ref', 'f.integer().readOnly()'],
  ])('%s -> %s', (name, expected) => {
    expect(render(columns, name)).toBe(expected)
  })
})

describe('indexing', () => {
  const index = (columns: string[], method: string, opclasses: string[], partial = false): DbIndex => ({
    name: `orders_${columns.join('_')}_idx`,
    columns,
    unique: false,
    primary: false,
    partial,
    method,
    opclasses,
  })
  const indexed = (name: string, typeName: string, indexes: DbIndex[]) => {
    const t: DbTable = { ...table([column('id', 'uuid'), column('tenant_id', 'uuid'), column(name, typeName)]), indexes }
    const { filterable, sortable } = proposeField(t, t.columns.find((c) => c.name === name)!, { table: t, resourceNameOf: (_s, n) => n })
    return { filterable, sortable }
  }

  it.each<[string, string, DbIndex[], boolean, boolean]>([
    ['a btree index leading with it', 'int4', [index(['code'], 'btree', ['int4_ops'])], true, true],
    ['a btree index right after the tenant column', 'int4', [index(['tenant_id', 'code'], 'btree', ['uuid_ops', 'int4_ops'])], true, true],
    ['a btree index after another column', 'int4', [index(['id', 'code'], 'btree', ['uuid_ops', 'int4_ops'])], false, false],
    ['a partial btree index', 'int4', [index(['code'], 'btree', ['int4_ops'], true)], false, false],
    ['a hash index', 'int4', [index(['code'], 'hash', ['int4_ops'])], false, false],
    ['a BRIN index', 'int4', [index(['code'], 'brin', ['int4_minmax_ops'])], false, false],
    ['a GiST index without pg_trgm', 'text', [index(['code'], 'gist', ['range_ops'])], false, false],
    ['a pg_trgm GIN index on text', 'text', [index(['code'], 'gin', ['gin_trgm_ops'])], true, false],
    ['a pg_trgm GiST index on text', 'text', [index(['code'], 'gist', ['gist_trgm_ops'])], true, false],
  ])('a column with %s: filterable %s, sortable %s', (_case, typeName, indexes, filterable, sortable) => {
    expect(indexed('code', typeName, indexes)).toEqual({ filterable, sortable })
  })
})

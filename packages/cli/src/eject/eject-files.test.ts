import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { CheckedDefinition } from '@protobase/server/config-exports'
import type { DbColumn, DbIndex, DbTable } from '../db/model'
import { ejectFiles } from './eject-files'

const column = (name: string, typeName: string, formatted = typeName, extra: Partial<DbColumn> = {}): DbColumn => ({
  name,
  position: 1,
  typeName,
  formatted,
  isEnum: false,
  enumValues: [],
  notNull: false,
  identity: false,
  identityAlways: false,
  generated: false,
  ...extra,
})

const index = (name: string, columns: string[], extra: Partial<DbIndex> = {}): DbIndex => ({ name, columns, unique: false, primary: false, partial: false, method: 'btree', opclasses: columns.map(() => 'default'), ...extra })

// A table users added: a title searched by a pg_trgm index, a long text, a price and a column no field names.
const table: DbTable = {
  schema: 'user_tables',
  name: 'order_notes',
  kind: 'table',
  columns: [
    column('id', 'int8', 'bigint', { notNull: true, identity: true, identityAlways: true }),
    column('title', 'text'),
    column('body', 'text'),
    column('price', 'numeric', 'numeric(12,2)'),
    column('organization_id', 'int4', 'integer'),
    column('stray', 'text'),
  ],
  foreignKeys: [],
  indexes: [
    index('order_notes_pkey', ['id'], { unique: true, primary: true }),
    index('order_notes_title_idx', ['title']),
    index('order_notes_title_idx1', ['title'], { method: 'gin', opclasses: ['gin_trgm_ops'] }),
    index('order_notes_body_idx', ['body'], { method: 'gin', opclasses: ['gin_trgm_ops'] }),
    index('order_notes_price_idx', ['price']),
    index('order_notes_organization_id_idx', ['organization_id']),
  ],
  checks: [],
}

const field = (name: string, label: string, type: CheckedDefinition['fields'][number]['type'], extra: Partial<CheckedDefinition['fields'][number]> = {}) => ({ name, label, type, required: false, precision: null, scale: null, ...extra })

const definition: CheckedDefinition = {
  id: '1',
  name: 'order_notes',
  organization_id: null,
  singular_label: 'Order note',
  plural_label: "Orders' notes",
  title_field: 'title',
  version: '3',
  fields: [field('title', 'Title', 'text'), field('body', 'Body', 'long_text'), field('price', 'Price', 'decimal', { precision: 12, scale: 2 }), field('organization_id', 'Organisation', 'integer')],
}

// As the server serves it: what its indexes serve, and search on the title.
const model = resource('order_notes')
  .table('user_tables.order_notes')
  .fields({
    id: f.bigint().readOnly().dbDefault().filterable().sortable(),
    title: f.text().max(500).optional().filterable().sortable(),
    body: f.text().optional().filterable(),
    price: f.decimal({ precision: 12, scale: 2 }).optional().filterable().sortable(),
    organization_id: f.integer().optional().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.title])
  .toModel()

describe('ejectFiles', () => {
  const { data, ui } = ejectFiles({ table, definition, model })

  it('writes the resource of the same name over the same table, its fields as served and admins-only access', () => {
    expect(data).toBe(`import { f, resource, type AccessContext } from '@protobase/schema'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/** user_tables.order_notes */
export const orderNotes = resource('order_notes')
  .table('user_tables.order_notes')
  .fields({
    id: f.bigint().readOnly().filterable().sortable(),
    title: f.text().max(500).optional().filterable().sortable(),
    body: f.text().optional().filterable(),
    price: f.decimal({ precision: 12, scale: 2 }).optional().filterable().sortable(),
    organization_id: f.integer().optional().filterable().sortable(),
    stray: null,
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.title])
  .explicitGrants()
  .access({ list: admins, read: admins, create: admins, update: admins, delete: admins })
`)
  })

  it("writes the view with the definition's names, title and labels, a long text multiline, and scaffold's list", () => {
    expect(ui).toBe(`import { view } from '@protobase/schema'
import type { orderNotes } from './data'

export const orderNotesView = view<typeof orderNotes>('order_notes')
  .title((r) => r.title)
  .fields((r) => ({
    title: r.title.label('Title'),
    body: r.body.label('Body').multiline(),
    price: r.price.label('Price'),
    organization_id: r.organization_id.label('Organisation'),
  }))
  .names({ singular: 'Order note', plural: 'Orders\\' notes' })
  .list((r) => ({ columns: [r.id, r.title, r.price] }))
`)
  })
})

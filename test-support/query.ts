import type { SnapshotTemplateKey } from '../scripts/test-db/snapshot-templates'
import { openSnapshotDb } from './sql-snapshot'
import { checkFilter, parseFilter, type CheckedFilter, type FieldModel, type FieldType, type ResourceModel } from '@protobase/schema'

export const field = (name: string, type: FieldType, extra: Partial<FieldModel> = {}): FieldModel => ({
  name,
  column: name,
  type,
  nullable: false,
  readOnly: false,
  filterable: true,
  sortable: true,
  aliases: [],
  ...extra,
})

export const model = (name: string, primaryKey: string[], fields: FieldModel[], extra: Partial<ResourceModel> = {}): ResourceModel => ({
  name,
  table: { name },
  fields: Object.fromEntries(fields.map(f => [f.name, f])),
  primaryKey,
  ...extra,
})

export const items = model(
  'items',
  ['id'],
  [
    field('id', 'integer'),
    field('name', 'text'),
    field('category', 'enum', { enumValues: ['red', 'green', 'blue'] }),
    field('qty', 'integer'),
    field('price', 'decimal'),
    field('big', 'bigint'),
    field('active', 'boolean'),
    field('created_at', 'timestamp'),
    field('born', 'date'),
    field('note', 'text', { nullable: true }),
    field('ref', 'uuid'),
    field('attrs', 'json', { nullable: true }),
    field('deleted_at', 'timestamp', { nullable: true, filterable: false }),
    field('secret', 'text', { column: 'name', filterable: false, sortable: false }),
  ],
  { softDelete: 'deleted_at', search: ['name', 'note'] },
)

export const bigItems = model('big_items', ['id'], [field('id', 'bigint'), field('grp', 'integer'), field('label', 'text')])
export const uuidItems = model('uuid_items', ['id'], [field('id', 'uuid'), field('grp', 'integer'), field('label', 'text')])
export const orderLines = model('order_lines', ['order_id', 'line_no'], [
  field('order_id', 'integer'),
  field('line_no', 'integer'),
  field('qty', 'integer'),
  field('note', 'text'),
])

/** Parses and checks AIP-160 text against `target`; throws with the checker's messages when it is invalid. */
export const check = (target: ResourceModel, source: string): CheckedFilter => {
  const parsed = parseFilter(source)
  if (!parsed.ok || !parsed.ast) throw new Error(`Cannot parse "${source}": ${parsed.errors.map(e => e.message).join('; ')}`)
  const checked = checkFilter(target, parsed.ast)
  if (!checked.ok) throw new Error(`Cannot check "${source}": ${checked.errors.map(e => e.message).join('; ')}`)
  return checked.filter
}

const template = ({ trigram = false, seed = true }): SnapshotTemplateKey => (seed ? (trigram ? 'queryTrigram' : 'query') : trigram ? 'trigram' : 'empty')

/** A snapshot database of the query tables, 10k rows each; `seed: false` leaves them out, `trigram` adds pg_trgm. */
export const createTestDb = async ({ trigram = false, seed = true } = {}) => {
  const pg = await openSnapshotDb(template({ trigram, seed }))
  return { pg, db: pg.db }
}

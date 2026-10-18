import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { fromSnapshot } from './pglite-snapshot'
import { queryDdl } from './fixtures/query-ddl'
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

const pgOptions = (trigram: boolean) => (trigram ? { extensions: { pg_trgm } } : {})

export const buildTestPg = async ({ trigram = false, seed = true } = {}) => {
  const pg = new PGlite(pgOptions(trigram))
  if (trigram) await pg.exec('create extension pg_trgm')
  if (seed) {
    await pg.exec(queryDdl)
    await pg.exec('analyze')
  }
  return pg
}

/** The global setup's name for the dump of `buildTestPg(options)`; without trigram or seed it is the empty database. */
export const testDbSnapshot = ({ trigram = false, seed = true } = {}) => (!trigram && !seed ? 'empty' : `query${trigram ? '-trigram' : ''}${seed ? '' : '-empty'}`)

/** `seed: false` skips the tables and 10k rows (about a second of start-up) for tests that only need a connection. */
export const createTestDb = async ({ trigram = false, seed = true } = {}) => {
  const pg = await fromSnapshot(testDbSnapshot({ trigram, seed }), () => buildTestPg({ trigram, seed }), pgOptions(trigram))
  const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
  return { pg, db }
}

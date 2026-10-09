import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { fromSnapshot } from './pglite-snapshot'
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

const ddl = `
create table items (
  id integer generated always as identity primary key,
  name text not null, category text not null, qty integer not null,
  price numeric(10,2) not null, big bigint not null, active boolean not null,
  created_at timestamptz not null, born date not null, note text,
  ref uuid not null, deleted_at timestamptz, attrs jsonb
);
insert into items (name, category, qty, price, big, active, created_at, born, note, ref, deleted_at, attrs)
select 'item-' || i, (array['red','green','blue'])[1 + i % 3], (i * 7919) % 100, (i % 500) / 4.0,
  i::bigint * 1000000000, i % 2 = 0,
  timestamptz '2024-01-01 00:00:00+00' + (i % 400) * interval '1 day' + (i % 24) * interval '1 hour',
  date '2024-01-01' + (i % 400),
  case when i % 3 = 0 then 'alpha, beta, gamma' when i % 3 = 1 then 'Quick brown fox' else 'under_score 100%' end,
  md5(i::text)::uuid, case when i % 50 = 0 then timestamptz '2024-06-01+00' end,
  case i % 4 when 0 then '{"tag": "gold"}'::jsonb when 1 then '["x", "y"]'::jsonb when 2 then 'null'::jsonb end
from generate_series(1, 10000) i;

create table big_items (id bigint primary key, grp integer not null, label text not null);
insert into big_items select 5000000000 + i, (i * 31) % 40, 'label, ' || i from generate_series(1, 10000) i;

create table uuid_items (id uuid primary key, grp integer not null, label text not null);
insert into uuid_items select md5('u' || i)::uuid, (i * 31) % 40, 'label ' || i from generate_series(1, 10000) i;

create table order_lines (order_id integer, line_no integer, qty integer not null, note text not null, primary key (order_id, line_no));
insert into order_lines select 1 + (i - 1) / 5, 1 + (i - 1) % 5, (i * 13) % 17, 'a, b, ' || i from generate_series(1, 10000) i;
`

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
    await pg.exec(ddl)
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

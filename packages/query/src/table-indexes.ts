import { sql } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import type { Db } from './db'
import { quoteIdent } from './db'

/** One key of an index: its column, or null for an expression, which `definition` spells out. */
export type IndexKey = { column: string | null; definition: string; opclass: string }
/** A valid index of a table: its access method (`btree`, `gin`, ...), whether it has a WHERE, and its keys in order. */
export type TableIndex = { name: string; method: string; partial: boolean; keys: IndexKey[] }
/**
 * What the database holds for a resource's table: `table` for anything that carries indexes (a table, a partitioned
 * table or a materialized view), `other` for a plain view or a foreign table, whose indexes live elsewhere, and
 * `missing` when the name resolves to nothing.
 */
export type TableIndexes = { kind: 'table' | 'other' | 'missing'; indexes: TableIndex[] }

const qualifiedName = (model: ResourceModel) => {
  const { schema, name } = model.table
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
}

const indexedKinds = ['r', 'p', 'm']

/** Reads the valid indexes of the resource's table from the catalog, key by key (INCLUDE columns are no keys). */
export const tableIndexes = async (db: Db, model: ResourceModel): Promise<TableIndexes> => {
  const qualified = qualifiedName(model)
  const relation = await sql<{ relkind: string }>`select relkind from pg_class where oid = to_regclass(${qualified})`.execute(db)
  const relkind = relation.rows[0]?.relkind
  if (relkind === undefined) return { kind: 'missing', indexes: [] }
  if (!indexedKinds.includes(relkind)) return { kind: 'other', indexes: [] }
  const keys = await sql<{ name: string; method: string; partial: boolean; column: string | null; definition: string; opclass: string }>`
    select ic.relname as name, am.amname as method, (i.indpred is not null) as partial, a.attname::text as column,
      pg_get_indexdef(i.indexrelid, k.ord::int, true) as definition, oc.opcname::text as opclass
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam
    cross join lateral unnest(i.indkey::int2[], i.indclass::oid[]) with ordinality k(attnum, opclass, ord)
    left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum and k.attnum > 0
    join pg_opclass oc on oc.oid = k.opclass
    where i.indrelid = to_regclass(${qualified}) and i.indisvalid and i.indisready and k.ord <= i.indnkeyatts
    order by ic.relname, k.ord
  `.execute(db)
  const byName = new Map<string, TableIndex>()
  for (const { name, method, partial, column, definition, opclass } of keys.rows) {
    const index = byName.get(name) ?? { name, method, partial, keys: [] }
    index.keys.push({ column, definition, opclass })
    byName.set(name, index)
  }
  return { kind: 'table', indexes: [...byName.values()] }
}

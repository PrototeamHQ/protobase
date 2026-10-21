import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'

/** A foreign key that rewrites part of a resource's key when the record it points at changes its own. */
export type CascadingKey = { resource: string; constraint: string }

/**
 * The foreign keys of the resource's table, `on update cascade` or `set default`, over a column of its key: a key change
 * of the other record rewrites this record's key, and every encrypted value of the row then no longer opens.
 */
export const cascadingKeys = async (db: Db, model: ResourceModel): Promise<CascadingKey[]> => {
  const columns = model.primaryKey.map((name) => model.fields[name]!.column)
  const { rows } = await sql<{ constraint: string }>`select c.conname as "constraint"
from pg_constraint c
where c.contype = 'f' and c.confupdtype in ('c', 'd')
  and c.conrelid = to_regclass(${model.table.schema === undefined ? sql`quote_ident(${model.table.name})` : sql`quote_ident(${model.table.schema}) || '.' || quote_ident(${model.table.name})`})
  and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attname = any(${columns}::text[]))
order by c.conname`.execute(db)
  return rows.map(({ constraint }) => ({ resource: model.name, constraint }))
}

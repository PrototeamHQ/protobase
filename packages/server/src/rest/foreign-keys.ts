import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/**
 * A foreign key between tables of the `public` schema: `columns` of `table` reference `foreignColumns` of
 * `foreignTable`, pairwise. `unique` when its columns are the table's primary key or a unique constraint, which makes
 * the relationship one-to-one.
 */
export type ForeignKey = { name: string; table: string; columns: string[]; foreignTable: string; foreignColumns: string[]; unique: boolean }

const readForeignKeys = async (db: Db) => {
  const { rows } = await sql<ForeignKey>`
    select c.conname::text as name, s.relname::text as table, t.relname::text as "foreignTable",
      array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum order by k.ord) as columns,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum order by k.ord) as "foreignColumns",
      exists (select 1 from pg_constraint u where u.conrelid = c.conrelid and u.contype in ('p', 'u') and u.conkey @> c.conkey and u.conkey <@ c.conkey) as unique
    from pg_constraint c
    join pg_class s on s.oid = c.conrelid
    join pg_class t on t.oid = c.confrelid
    where c.contype = 'f' and s.relnamespace = 'public'::regnamespace and t.relnamespace = 'public'::regnamespace
    order by c.conname
  `.execute(db)
  return rows
}

/**
 * The foreign keys of the `public` schema, which `/api/sb/rest/v1` embeds through, read from the catalog once and kept for the
 * process lifetime, as the scan guard keeps indexes: migrations run before a new version serves.
 */
export const foreignKeyCache = (db: Db) => {
  let known: Promise<ForeignKey[]> | undefined
  return () => {
    known ??= readForeignKeys(db).catch((error: unknown) => {
      known = undefined
      throw error
    })
    return known
  }
}

export type ForeignKeys = ReturnType<typeof foreignKeyCache>

import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ObjectMetadata } from './object-sql'

/** What `list()` sends: the folder to list, a name start to search for, a page and an order. */
export type ListQuery = { prefix: string; search: string; limit: number; offset: number; column: 'name' | 'updated_at' | 'created_at' | 'last_accessed_at'; order: 'asc' | 'desc' }

/** An entry of a folder: an object, or a folder below it, whose other fields are null, as Supabase Storage lists them. */
export type ListEntry = { name: string; id: string | null; updated_at: Date | null; created_at: Date | null; last_accessed_at: Date | null; metadata: ObjectMetadata | null }

const likeEscaped = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

/**
 * One level of `bucket` below the folder `prefix` (`''` for the top, else ending in `/`), as the transaction's role may
 * see it: the objects directly in it and the folders that hold objects deeper down, whose names start with `search`
 * (case-insensitive). Folders sort with the objects by name; by any other column they come first, as in Supabase.
 */
export const listFolder = async (trx: Db, bucket: string, query: ListQuery) => {
  // Postgres counts characters, where JavaScript counts UTF-16 code units.
  const start = [...query.prefix].length + 1
  const order = sql.raw(query.order === 'desc' ? 'desc' : 'asc')
  const { rows } = await sql<ListEntry>`
    with level as (
      select split_part(substr(name, ${start}), '/', 1) as entry, strpos(substr(name, ${start}), '/') > 0 as folder, id, updated_at, created_at, last_accessed_at, metadata
      from storage.objects
      where bucket_id = ${bucket} and name like ${`${likeEscaped(query.prefix)}%`} and substr(name, ${start}) ilike ${`${likeEscaped(query.search)}%`}
    ), entries as (
      select distinct on (entry) entry as name, folder, case when folder then null else id end as id,
        case when folder then null else updated_at end as updated_at, case when folder then null else created_at end as created_at,
        case when folder then null else last_accessed_at end as last_accessed_at, case when folder then null else metadata end as metadata
      from level order by entry, folder desc
    )
    select name, id, updated_at, created_at, last_accessed_at, metadata from entries
    order by ${query.column === 'name' ? sql`name collate "C" ${order}` : sql`folder desc, ${sql.ref(query.column)} ${order} nulls last, name collate "C"`}
    limit ${query.limit} offset ${query.offset}`.execute(trx)
  return rows
}

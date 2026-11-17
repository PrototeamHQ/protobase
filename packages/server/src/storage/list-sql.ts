import { sql, type RawBuilder } from 'kysely'
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
 *
 * The level is walked on `(bucket_id, name collate "C")` in batches up to the first folder: after an object the next
 * name, after a folder the first name past everything in it (`'0'` follows `'/'`), so a folder costs one read however
 * much it holds. A batch is twice the last after objects, up to 1,000, and one after a folder, so a run of objects is
 * read as a range, not one look-up each.
 */
export const listFolder = async (trx: Db, bucket: string, query: ListQuery) => {
  // Postgres counts characters, where JavaScript counts UTF-16 code units.
  const start = [...query.prefix].length + 1
  const order = sql.raw(query.order === 'desc' ? 'desc' : 'asc')
  // The names below the folder end before the first name past it, so a read stops there, not at the bucket's end.
  const end = query.prefix === '' ? sql`` : sql`and name collate "C" < ${`${query.prefix.slice(0, -1)}0`}`
  const within = sql`bucket_id = ${bucket} and name collate "C" like ${`${likeEscaped(query.prefix)}%`} ${end} and substr(name, ${start}) ilike ${`${likeEscaped(query.search)}%`}`
  const columns = sql`name, strpos(substr(name, ${start}), '/') > 0 as folder, id, updated_at, created_at, last_accessed_at`
  // The objects from `from` on, up to `size` of them and the first folder among them. The last says where the next
  // batch starts and how many it reads.
  const batch = (from: RawBuilder<unknown>, size: RawBuilder<unknown>) => sql`
    select name, folder, id, updated_at, created_at, last_accessed_at, n = coalesce(first_folder, fetched) as last, case when folder then 1 else least(${size} * 2, 1000) end as size
    from (select numbered.*, min(n) filter (where folder) over () as first_folder, count(*) over () as fetched
      from (select page.*, row_number() over (order by name collate "C") as n
        from (select ${columns} from storage.objects where ${within} and name collate "C" >= ${from} order by name collate "C" limit ${size}) page) numbered) counted
    where n <= coalesce(first_folder, fetched)`
  const sorted = query.column === 'name' ? sql`name collate "C" ${order}` : sql`folder desc, ${sql.ref(query.column)} ${order} nulls last, name collate "C"`
  const { rows } = await sql<ListEntry>`
    with recursive walk as (
      ${batch(sql`${query.prefix}`, sql`1`)}
      union all
      select next.* from walk cross join lateral (
        ${batch(sql`case when walk.folder then ${query.prefix} || split_part(substr(walk.name, ${start}), '/', 1) || '0' else walk.name || chr(1) end`, sql`walk.size`)}
      ) next where walk.last
    ), entries as (
      select distinct on (entry) entry as name, folder, case when folder then null else id end as id,
        case when folder then null else updated_at end as updated_at, case when folder then null else created_at end as created_at,
        case when folder then null else last_accessed_at end as last_accessed_at
      from (select split_part(substr(name, ${start}), '/', 1) as entry, folder, id, updated_at, created_at, last_accessed_at from walk) level
      order by entry, folder desc
    ), page as (
      select * from entries order by ${sorted} limit ${query.limit} offset ${query.offset}
    )
    -- The metadata of the page's objects only: the walk carries none of the level's.
    select name, page.id, updated_at, created_at, last_accessed_at, object.metadata from page
    left join lateral (select metadata from storage.objects where storage.objects.id = page.id) object on true
    order by ${sorted}`.execute(trx)
  return rows
}

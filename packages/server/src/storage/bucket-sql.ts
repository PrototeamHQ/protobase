import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** A row of `storage.buckets`, with the columns every Storage version has. */
export type BucketRow = {
  id: string
  name: string
  owner: string | null
  owner_id: string | null
  public: boolean
  file_size_limit: number | null
  allowed_mime_types: string[] | null
  created_at: Date
  updated_at: Date
}

/** What creating or changing a bucket sets; a missing key keeps the column as it is. */
export type BucketWrite = { public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null }

const columns = sql`id, name, owner, owner_id, public, file_size_limit::float8 as file_size_limit, allowed_mime_types, created_at, updated_at`

/** The bucket `id`, as the transaction's role may see it. */
export const findBucket = async (trx: Db, id: string) => {
  const { rows } = await sql<BucketRow>`select ${columns} from storage.buckets where id = ${id}`.execute(trx)
  return rows[0]
}

/** Every bucket the transaction's role may see, by name. */
export const listBuckets = async (trx: Db) => (await sql<BucketRow>`select ${columns} from storage.buckets order by name collate "C"`.execute(trx)).rows

/** Adds a bucket; RLS refuses it with 42501, a taken id or name with 23505. */
export const insertBucket = async (trx: Db, bucket: { id: string; name: string; owner: string | null } & BucketWrite) => {
  await sql`
    insert into storage.buckets (id, name, owner_id, public, file_size_limit, allowed_mime_types)
    values (${bucket.id}, ${bucket.name}, ${bucket.owner}, ${bucket.public ?? false}, ${bucket.file_size_limit ?? null}, ${bucket.allowed_mime_types ?? null})`.execute(trx)
}

/** Changes the bucket `id`; whether the transaction's role could. */
export const updateBucket = async (trx: Db, id: string, write: BucketWrite) => {
  const sets = Object.entries(write).filter(([, value]) => value !== undefined).map(([column, value]) => sql`${sql.ref(column)} = ${value}`)
  if (sets.length === 0) return (await findBucket(trx, id)) !== undefined
  const result = await sql`update storage.buckets set ${sql.join(sets)} where id = ${id}`.execute(trx)
  return result.numAffectedRows === 1n
}

/** Deletes the bucket `id`; whether the transaction's role could. A bucket that still has objects fails with 23503. */
export const deleteBucket = async (trx: Db, id: string) => {
  await sql`select set_config('storage.allow_delete_query', 'true', true)`.execute(trx)
  const result = await sql`delete from storage.buckets where id = ${id}`.execute(trx)
  return result.numAffectedRows === 1n
}

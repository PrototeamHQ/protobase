import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** What Supabase Storage keeps in `storage.objects.metadata` about the bytes. */
export type ObjectMetadata = {
  eTag: string
  size: number
  mimetype: string
  cacheControl: string
  lastModified: string
  contentLength: number
  httpStatusCode: number
}

/** A row of `storage.objects`, with the columns every Storage version has. */
export type ObjectRow = {
  id: string
  bucket_id: string
  name: string
  owner: string | null
  owner_id: string | null
  version: string | null
  metadata: ObjectMetadata | null
  user_metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  last_accessed_at: Date
}

/** A row to write: who owns it, the version its bytes are kept under and what they are. */
export type ObjectWrite = { owner: string | null; version: string; metadata: ObjectMetadata; user_metadata: Record<string, unknown> | null }

const columns = sql`id, bucket_id, name, owner, owner_id, version, metadata, user_metadata, created_at, updated_at, last_accessed_at`

// `owner` is a uuid, the deprecated column; `owner_id` takes any user id.
const ownerUuid = (owner: string | null) => (owner !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner) ? owner : null)

/** The object `name` of `bucket`, as the transaction's role may see it; locked for the transaction when `lock`. */
export const findObject = async (trx: Db, bucket: string, name: string, lock = false) => {
  const { rows } = await sql<ObjectRow>`select ${columns} from storage.objects where bucket_id = ${bucket} and name = ${name} ${lock ? sql`for update` : sql``}`.execute(trx)
  return rows[0]
}

/** The object `name` of a public bucket, for anyone. */
export const findPublicObject = async (trx: Db, bucket: string, name: string) => {
  const { rows } = await sql<ObjectRow>`
    select ${columns} from storage.objects
    where bucket_id = ${bucket} and name = ${name} and exists (select from storage.buckets where id = ${bucket} and public)`.execute(trx)
  return rows[0]
}

/** Which of `names` in `bucket` the transaction's role may see. */
export const visibleNames = async (trx: Db, bucket: string, names: string[]) =>
  (await sql<{ name: string }>`select name from storage.objects where bucket_id = ${bucket} and name = any(${names}::text[])`.execute(trx)).rows.map((row) => row.name)

/** Adds the object; RLS refuses it with 42501, an existing name with 23505. No `returning`, which would need a select policy too. */
export const insertObject = async (trx: Db, bucket: string, name: string, write: ObjectWrite) => {
  const id = crypto.randomUUID()
  await sql`
    insert into storage.objects (id, bucket_id, name, owner, owner_id, version, metadata, user_metadata)
    values (${id}, ${bucket}, ${name}, ${ownerUuid(write.owner)}, ${write.owner}, ${write.version}, ${JSON.stringify(write.metadata)}, ${write.user_metadata === null ? null : JSON.stringify(write.user_metadata)})`.execute(trx)
  return id
}

/** Replaces the object with `id`; whether the transaction's role could. */
export const updateObject = async (trx: Db, id: string, write: ObjectWrite) => {
  const result = await sql`
    update storage.objects set owner = ${ownerUuid(write.owner)}, owner_id = ${write.owner}, version = ${write.version},
      metadata = ${JSON.stringify(write.metadata)}, user_metadata = ${write.user_metadata === null ? null : JSON.stringify(write.user_metadata)}
    where id = ${id}`.execute(trx)
  return result.numAffectedRows === 1n
}

/** Gives the object `name` a new bucket, name and version, as a move does; whether the transaction's role could. */
export const renameObject = async (trx: Db, from: { bucket: string; name: string }, to: { bucket: string; name: string; version: string; owner: string | null }) => {
  const result = await sql`
    update storage.objects set bucket_id = ${to.bucket}, name = ${to.name}, version = ${to.version}, owner = ${ownerUuid(to.owner)}, owner_id = ${to.owner}
    where bucket_id = ${from.bucket} and name = ${from.name}`.execute(trx)
  return result.numAffectedRows === 1n
}

/**
 * Deletes the objects of `bucket` named in `names` that the transaction's role may delete, and gives them back. The
 * restored schema refuses a delete unless `storage.allow_delete_query` is set, as Supabase Storage sets it.
 */
export const deleteObjects = async (trx: Db, bucket: string, names: string[]) => {
  await sql`select set_config('storage.allow_delete_query', 'true', true)`.execute(trx)
  const { rows } = await sql<ObjectRow>`delete from storage.objects where bucket_id = ${bucket} and name = any(${names}::text[]) returning ${columns}`.execute(trx)
  return rows
}

/** Every object of `bucket` the transaction's role may delete, deleted and given back, as emptying a bucket does. */
export const deleteBucketObjects = async (trx: Db, bucket: string) => {
  await sql`select set_config('storage.allow_delete_query', 'true', true)`.execute(trx)
  const { rows } = await sql<ObjectRow>`delete from storage.objects where bucket_id = ${bucket} returning ${columns}`.execute(trx)
  return rows
}

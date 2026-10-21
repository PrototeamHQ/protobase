import type postgres from 'postgres'

/** An object of `storage.objects`, with the size and ETag Supabase recorded for its bytes, where it did. */
export type SourceObject = { bucket: string; name: string; version: string | null; size: number | undefined; eTag: string | undefined }

/** Every object the load restored to `storage.objects`, by bucket and name. */
export const storageObjects = async (sql: postgres.Sql): Promise<SourceObject[]> => {
  const rows = await sql<{ bucket: string; name: string; version: string | null; size: string | null; etag: string | null }[]>`
    select bucket_id as bucket, name, version, metadata->>'size' as size, metadata->>'eTag' as etag
    from storage.objects where name is not null order by bucket_id, name
  `
  return rows.map((row) => ({ bucket: row.bucket, name: row.name, version: row.version, size: row.size === null ? undefined : Number(row.size), eTag: row.etag ?? undefined }))
}

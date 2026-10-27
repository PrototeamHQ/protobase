import type { TransactionSql } from 'postgres'

/**
 * Copies the record of applied migrations an earlier Protobase kept in `public.schema_migrations` into
 * `migrations.applied`, so a database it migrated applies nothing twice. It reads that table only when it has
 * Protobase's columns, `name` and `applied_at`: a version-keyed `schema_migrations` another migration tool owns is
 * never read or written. The old table stays, for a version still serving or rolled back to.
 */
export const adoptPublicRecord = async (tx: TransactionSql) => {
  const columns = await tx`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'schema_migrations' and column_name in ('name', 'applied_at')`
  if (columns.length < 2) return
  await tx`insert into migrations.applied (name, applied_at) select name, applied_at from public.schema_migrations`
}

import { connect } from './connection'

const sql = connect({ max: 1 })

await sql.unsafe('drop schema if exists market, members, auth, jobs cascade')
await sql.unsafe('drop schema if exists migrations cascade')
await sql.unsafe('drop table if exists public.seed_info')
// The record an earlier Protobase kept, by its columns: a `schema_migrations` another migration tool owns stays.
const [earlier] = await sql`
  select count(*) = 2 as ours from information_schema.columns
  where table_schema = 'public' and table_name = 'schema_migrations' and column_name in ('name', 'applied_at')`
if (earlier!.ours) await sql.unsafe('drop table public.schema_migrations')
console.log('dropped all property portal schemas')

await sql.end()

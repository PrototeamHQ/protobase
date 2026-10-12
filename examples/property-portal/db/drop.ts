import { connect } from './connection'

const sql = connect({ max: 1 })

await sql.unsafe('drop schema if exists market, members, auth, jobs cascade')
await sql.unsafe('drop table if exists public.schema_migrations, public.seed_info')
console.log('dropped all property portal schemas')

await sql.end()

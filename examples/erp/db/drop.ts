import { connect } from './connection'

const sql = connect({ max: 1 })

await sql.unsafe('drop schema if exists core, crm, catalog, sales, inventory, hr cascade')
await sql.unsafe('drop table if exists public.schema_migrations, public.seed_info')
console.log('dropped all erp schemas')

await sql.end()

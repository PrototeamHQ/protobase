import postgres from 'postgres'
import { databaseUrl } from './connection'

// The Postgres container already holds the ERP's database; this one sits beside it, created through the server's
// maintenance database.
const name = new URL(databaseUrl).pathname.slice(1)
const server = new URL(databaseUrl)
server.pathname = '/postgres'

const sql = postgres(server.toString(), { max: 1, onnotice: () => {} })
const [existing] = await sql`select 1 from pg_database where datname = ${name}`
if (existing) console.log(`database ${name} exists`)
else {
  await sql.unsafe(`create database "${name}"`)
  console.log(`created database ${name}`)
}
await sql.end()

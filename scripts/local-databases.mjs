// `pnpm db:up`, once the Postgres container is up: gives each example a .env from its .env.example, and creates the
// database that DATABASE_URL names there when the server does not have it yet. The examples' scripts read only their
// own environment and never create their database: that is up to the host, this script here and the platform for an app.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

const examples = ['erp', 'real-estate']

for (const example of examples) {
  const dir = path.join('examples', example)
  if (!existsSync(path.join(dir, '.env'))) copyFileSync(path.join(dir, '.env.example'), path.join(dir, '.env'))
  const line = readFileSync(path.join(dir, '.env'), 'utf8').split('\n').find((text) => text.startsWith('DATABASE_URL='))
  if (!line) throw new Error(`${dir}/.env has no DATABASE_URL`)
  const url = new URL(line.slice('DATABASE_URL='.length).trim())
  const name = url.pathname.slice(1)
  url.pathname = '/postgres'
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
  const [existing] = await sql`select 1 from pg_database where datname = ${name}`
  if (!existing) {
    await sql.unsafe(`create database "${name}"`)
    console.log(`created database ${name} for ${example}`)
  }
  await sql.end()
}

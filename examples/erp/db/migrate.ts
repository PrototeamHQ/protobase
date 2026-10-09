import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { connect } from './connection'

const directory = fileURLToPath(new URL('./migrations/', import.meta.url))

const sql = connect({ max: 1 })

await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`

const applied = new Set((await sql`select name from public.schema_migrations`).map((row) => row.name))
const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()

for (const file of files) {
  if (applied.has(file)) continue
  const text = await readFile(directory + file, 'utf8')
  await sql.begin(async (tx) => {
    await tx.unsafe(text)
    await tx`insert into public.schema_migrations (name) values (${file})`
  })
  console.log(`applied ${file}`)
}

await sql.end()

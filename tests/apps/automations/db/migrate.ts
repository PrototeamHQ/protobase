import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { connect } from './connection'

// Applies the migrations not applied yet, the app's and the auth schema's alike, in file name order and in one
// transaction: when one fails, none is applied and the database stays as the running version expects it. Run it before
// a new version serves, while nothing else writes. A statement Postgres runs only outside a transaction, such as
// `create index concurrently`, does not belong in these files.

const directory = fileURLToPath(new URL('./migrations/', import.meta.url))
// Any constant shared by every run of this script and `protobase migrate`: a second run while one runs refuses at once,
// since waiting on the lock would deadlock with an index the first builds concurrently.
const lockKey = 7_311_946_202

const sql = connect({ max: 1 })
// An `.after.sql` runs outside a transaction, which `protobase migrate` does; this script leaves it.
const files = (await readdir(directory)).filter((file) => file.endsWith('.sql') && !file.endsWith('.after.sql')).sort()

const applied = await sql.begin(async (tx) => {
  const [lock] = await tx`select pg_try_advisory_xact_lock(${lockKey}) as locked`
  if (!lock!.locked) throw new Error('Another run of the migrations is applying them to this database: run this again once that one has ended')
  await tx`create schema if not exists migrations`
  await tx`create table if not exists migrations.applied (name text primary key, applied_at timestamptz not null default now())`
  const done = new Set((await tx`select name from migrations.applied`).map((row) => row.name))
  const pending = files.filter((file) => !done.has(file))
  for (const file of pending) {
    await tx.unsafe(await readFile(directory + file, 'utf8'))
    await tx`insert into migrations.applied (name) values (${file})`
  }
  return pending
})
for (const file of applied) console.log(`applied ${file}`)

await sql.end()

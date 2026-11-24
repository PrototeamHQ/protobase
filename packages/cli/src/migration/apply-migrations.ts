import type { ReservedSql, Sql } from 'postgres'
import { forceSetting } from '@protobase/server/internal'
import { adoptPublicRecord } from './adopt-public-record'
import { fillRow } from './record/fill-row'
import { readMigrationDir, type DirMigration } from './record/migration-dir'
import { pendingIn, unfinishedIds } from './record/pending'
import { runAfter } from './record/run-after'

// The key of the presets' db/migrate.ts scripts too, so this runner and theirs refuse to run while the other does.
export const lockKey = 7_311_946_202

// Each file runs as the text of a PL/pgSQL EXECUTE, passed as a setting so it needs no quoting: Postgres refuses
// BEGIN, COMMIT, ROLLBACK, SAVEPOINT and a committing DO or procedure there, and statements that cannot run in a
// transaction, so no file ends the transaction early.
export const executeFile = "do $migration$ begin execute current_setting('migrations.file'); end $migration$"

/** What refuses a second run: waiting on the lock instead would deadlock with an index the first builds concurrently. */
export const lockTaken = 'Another run of `migrate` is applying migrations to this database: run it again once that one has ended'

/** The pending migrations in batches, each ending at one with an `.after.sql`, which runs once its batch commits. */
const batches = (pending: DirMigration[]) => {
  const all: DirMigration[][] = [[]]
  for (const migration of pending) {
    all.at(-1)!.push(migration)
    if (migration.after) all.push([])
  }
  return all.filter((batch) => batch.length > 0)
}

// The codes of a connection that is lost, closed by Postgres, the client or the network: nothing more can be sent on
// it, so no rollback or unlock is tried. Postgres ends the session's transaction and locks once it sees it gone.
const connectionLostCodes = ['57P01', '57P02', '57P03', 'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'CONNECTION_ENDED', 'ECONNRESET', 'EPIPE']
const connectionLost = (error: unknown) => connectionLostCodes.includes((error as { code?: string }).code ?? '')

// A transaction on the reserved connection, which holds the session's lock: rolled back when `run` fails.
const transaction = async <T>(sql: ReservedSql, run: () => Promise<T>) => {
  await sql`begin`
  const result = await run().catch(async (error: unknown) => {
    if (!connectionLost(error)) await sql`rollback`
    throw error
  })
  await sql`commit`
  return result
}

const applyBatch = (tx: ReservedSql, batch: DirMigration[], out: (text: string) => void, force: boolean) =>
  transaction(tx, async () => {
    if (force) await tx`select set_config(${forceSetting}, 'true', true)`
    for (const migration of batch) {
      out(`applying ${migration.file}\n`)
      await tx`select set_config('migrations.file', ${migration.text}, true)`
      await tx.unsafe(executeFile)
      await tx`insert into migrations.applied (name) values (${migration.file}) on conflict (name) do nothing`
      await fillRow(tx, migration)
    }
  })

// Finishes the `.after.sql` of each migration a stopped run left unfinished, in the order they were applied.
const finishUnfinished = async (sql: ReservedSql, ids: string[], migrations: DirMigration[], out: (text: string) => void) => {
  for (const id of ids) {
    const migration = migrations.find((candidate) => candidate.id === id)
    if (!migration?.after) throw new Error(`The record of migrations has ${id} unfinished, and no migration of the folder with that id has an .after.sql to finish it`)
    out(`finishing ${migration.after.file}\n`)
    await runAfter(sql, id, migration.after.text)
  }
}

// Under the lock: the record made and read in a transaction, the unfinished migrations finished, then each batch.
const apply = async (session: ReservedSql, migrations: DirMigration[], out: (text: string) => void, force: boolean) => {
  const { pending, unfinished } = await transaction(session, async () => {
    const [record] = await session<{ fresh: boolean }[]>`select to_regclass('migrations.applied') is null as fresh`
    await session`create schema if not exists migrations`
    await session`create table if not exists migrations.applied (name text primary key, applied_at timestamptz not null default now())`
    if (record!.fresh) await adoptPublicRecord(session)
    return { pending: await pendingIn(session, migrations), unfinished: await unfinishedIds(session) }
  })
  await finishUnfinished(session, unfinished, migrations, out)
  for (const batch of batches(pending)) {
    await applyBatch(session, batch, out, force)
    const last = batch.at(-1)!
    if (!last.after) continue
    out(`running ${last.after.file}\n`)
    await runAfter(session, last.id!, last.after.text)
  }
  out(pending.length > 0 ? `applied ${pending.length} migrations\n` : 'the database is up to date\n')
  return pending.map(({ file }) => file)
}

/**
 * Applies the `*.sql` files of `dir` the database has not applied (`pendingIn`), in file name order, behind an
 * advisory lock it only tries, refusing while another run holds it. They apply in batches, one transaction each, so
 * when a file fails none of its batch is applied: a batch ends at a file with an `.after.sql`, whose statements then
 * run outside a transaction before the next batch, and set its row's `completed_at`. A migration a stopped run left
 * unfinished is finished first. The lock is released at the end, or with the connection when that is lost. Run it
 * before a new version serves, while nothing else writes. With `force`, each transaction sets `protobase.force`, which
 * lets a sign-in module turned on again bring back the rows its kept tables hold. Returns the names it applied.
 */
export const applyMigrations = async (sql: Sql, dir: string, out: (text: string) => void, { force = false } = {}) => {
  const migrations = await readMigrationDir(dir)
  const session = await sql.reserve()
  try {
    const [lock] = await session<{ locked: boolean }[]>`select pg_try_advisory_lock(${lockKey}) as locked`
    if (!lock!.locked) throw new Error(lockTaken)
    const unlock = () => session`select pg_advisory_unlock(${lockKey})`
    const applied = await apply(session, migrations, out, force).catch(async (error: unknown) => {
      if (!connectionLost(error)) await unlock()
      throw error
    })
    await unlock()
    return applied
  } finally {
    session.release()
  }
}

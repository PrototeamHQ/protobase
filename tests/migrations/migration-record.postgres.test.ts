import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeAuthMigration } from '../../packages/cli/src/auth/write-migration'
import { recordBlock, type RecordRow } from '../../packages/cli/src/migration/record/record-block'
import { checkMigrationRecord } from '../../packages/server/src/migration-record/check-record'
import { createAuth, modelHash, runtimeModel, storeNamesList, type RecordModel } from '../../packages/server/src/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// The server's startup read of the record of migrations, on real Postgres: this version over a database a release after
// it migrated, and over one a release before it left. Those releases' rows are the ones their files would insert.

const secret = 'migration-record-test-secret-migration-record'
const authOn = (database: PostgresDatabase) => createAuth({ database: database.pool({ max: 2 }), baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [] })

// This version's model with some modules at other steps, as another release's files record it.
const withSteps = (model: RecordModel, steps: Record<string, number>): RecordModel => {
  const auth = structuredClone(model.auth!)
  for (const [module, step] of Object.entries(steps)) auth.modules[module as keyof typeof auth.modules]!.lastStep = step
  return { auth }
}

const row = (name: string, model: RecordModel, rest: Partial<RecordRow> = {}): RecordRow => ({
  id: name,
  number: Number(name.split('_')[0]),
  name,
  protobaseVersion: '1.1.0',
  model,
  modelHash: modelHash(model),
  physical: { auth: storeNamesList(model.auth!) },
  additive: true,
  completed: true,
  ...rest,
})

// The store as this version's `protobase auth migration` writes it, applied.
const migratedByThisVersion = async (database: PostgresDatabase) => {
  const auth = authOn(database)
  const project = await mkdtemp(path.join(tmpdir(), 'protobase-migration-record-'))
  const file = await writeAuthMigration({ auth, projectDir: project, dir: path.join(project, 'db/migrations'), name: 'auth' })
  await database.exec(await readFile(file!, 'utf8'))
  await rm(project, { recursive: true, force: true })
  return auth
}

describe.skipIf(!(await postgresTemplateReady('empty')))('the startup read of the record of migrations', () => {
  it('starts on a database the next release migrated by additive files only, and refuses once one is not additive', async () => {
    const database = await openPostgresDatabase('empty')
    const auth = await migratedByThisVersion(database)
    await expect(checkMigrationRecord(auth, '1.0.0')).resolves.toBeUndefined()

    const next = withSteps(runtimeModel(auth), { passkeys: 3 })
    await database.exec(recordBlock(row('002_auth', next), null))
    await expect(checkMigrationRecord(auth, '1.0.0')).resolves.toBeUndefined()

    await database.exec(recordBlock(row('003_rename', next, { additive: false, protobaseVersion: '1.2.0' }), null))
    await expect(checkMigrationRecord(auth, '1.0.0')).rejects.toThrow(
      'The database is ahead of Protobase 1.0.0, so the server will not start: it has migrations that are not additive since the one this version reads: 003_rename. To bring the database up to 1.0.0, run `protobase migrate --plan` to see the migrations it will apply, then `protobase migrate`. Or run Protobase 1.2.0, the version the database matches.',
    )
  })

  it('refuses a database the release before left, naming what it lacks, the versions and the two ways out', async () => {
    const database = await openPostgresDatabase('empty')
    const auth = authOn(database)
    await database.exec(recordBlock(row('001_auth', withSteps(runtimeModel(auth), { passkeys: 1 }), { protobaseVersion: '0.9.0' }), null))
    await expect(checkMigrationRecord(auth, '1.0.0')).rejects.toThrow(
      "The database is behind Protobase 1.0.0, so the server will not start: the auth store's passkeys module is at step 1 (passkeys), and this version needs step 2 (rp_id_index). To bring the database up to 1.0.0, run `protobase migrate --plan` to see the migrations it will apply, then `protobase migrate`. Or run Protobase 0.9.0, the version the database matches.",
    )
  })

  it('starts while a plain index is still building, and refuses while a unique one is', async () => {
    const database = await openPostgresDatabase('empty')
    const auth = await migratedByThisVersion(database)
    const model = runtimeModel(auth)
    await database.exec(recordBlock(row('002_indexes', model, { completed: false, physical: { after: [{ index: 'user_email_idx', unique: false }] } }), null))
    await expect(checkMigrationRecord(auth, '1.0.0')).resolves.toBeUndefined()

    await database.exec(recordBlock(row('003_unique', model, { completed: false, physical: { after: [{ index: 'user_email_key', unique: true }] } }), null))
    await expect(checkMigrationRecord(auth, '1.0.0')).rejects.toThrow("The database's migrations have not finished, so the server will not start: 003_unique has not finished building the unique index user_email_key.")
  })
})

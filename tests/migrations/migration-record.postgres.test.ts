import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { writeAuthMigration } from '../../packages/cli/src/auth/write-migration'
import { recordBlock, type RecordRow } from '../../packages/cli/src/migration/record/record-block'
import { checkMigrationRecord } from '../../packages/server/src/migration-record/check-record'
import { writeBaseline } from '../../packages/cli/src/migration/baseline/write-baseline'
import { runMigration } from '../../packages/cli/src/migration/snapshot/run-migration'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { callsSchemaSql, captureSchemaSql, channelSendsSchemaSql, jobsSchemaSql, neededModules, notificationsSchemaSql, realtimeRelaySchemaSql, relaySchemaSql, statusSchemaSql, webhooksSchemaSql, workflowsSchemaSql, type AdminAuth, type ModuleApp } from '../../packages/server/src/index'
import { createAuth, modelHash, noInput, plainStoreDb, runtimeModel, schemaModules, storeNames, storeNamesList, type ModuleTargets, type RecordModel } from '../../packages/server/src/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// The server's startup read of the record of migrations, on real Postgres: this version over a database a release after
// it migrated, and over one a release before it left. Those releases' rows are the ones their files would insert.

const secret = 'migration-record-test-secret-migration-record'
const authOn = (database: PostgresDatabase) => createAuth({ database: database.pool({ max: 2 }), baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [] })

// The startup read as an app with `auth` and the schema modules `modules` makes it.
const check = (auth: AdminAuth, modules: ModuleTargets = {}) => checkMigrationRecord(plainStoreDb(auth), runtimeModel(auth, modules), '1.0.0')

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

// The store as this version's `protobase auth migration` writes it, applied, in a project of its own, which the test
// removes unless it goes on writing migrations there.
const migratedByThisVersion = async (database: PostgresDatabase, keep = false) => {
  const auth = authOn(database)
  const project = await mkdtemp(path.join(tmpdir(), 'protobase-migration-record-'))
  const file = await writeAuthMigration({ auth, projectDir: project, dir: path.join(project, 'db/migrations'), name: 'auth' })
  await database.exec(await readFile(file!, 'utf8'))
  if (!keep) await rm(project, { recursive: true, force: true })
  return { auth, project }
}

// `protobase migration` of the project with the jobs schema on, from its snapshot, compared with `database` when given.
const migrateWithJobs = (project: string, auth: AdminAuth, database?: PostgresDatabase) =>
  runMigration({
    projectDir: project,
    dir: path.join(project, 'db/migrations'),
    auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined },
    modules: { jobs: noInput },
    database: database && { url: database.url, parts: [], contractions: async () => [], readModule: (id, input) => schemaModules[id].read(database.db, input) },
    protobaseVersion: '1.0.0',
    newId: () => 'jobs-id',
  })

// `protobase migration` of the project with the schema modules `models` need, compared with `database` when given.
const migrateModels = (project: string, auth: AdminAuth, models: ResourceModel[], id: string, database?: PostgresDatabase) =>
  runMigration({
    projectDir: project,
    dir: path.join(project, 'db/migrations'),
    auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined },
    modules: neededModules({ models, views: [], jobs: [], signIn: true }),
    database: database && { url: database.url, parts: [], contractions: async () => [], readModule: (module, input) => schemaModules[module].read(database.db, input) },
    protobaseVersion: '1.0.0',
    newId: () => id,
  })

// `protobase migration` of the project with the schema modules `app` needs, with sign-in, compared with `database` when given.
const migrateApp = (project: string, auth: AdminAuth, app: Partial<ModuleApp>, id: string, database?: PostgresDatabase) =>
  runMigration({
    projectDir: project,
    dir: path.join(project, 'db/migrations'),
    auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined },
    modules: featureModules(auth, app),
    database: database && { url: database.url, parts: [], contractions: async () => [], readModule: (module, input) => schemaModules[module].read(database.db, input) },
    protobaseVersion: '1.0.0',
    newId: () => id,
  })

const featureModules = (auth: AdminAuth, app: Partial<ModuleApp>) => neededModules({ models: [], views: [], jobs: [], signIn: true, authStore: storeNames(auth), ...app })

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id)
const refunds = resource('refunds').table('refunds').fields({ id: f.integer(), total: f.integer() }).primaryKey((r) => r.id)
const tables = 'create table notes (id integer primary key, body text not null); create table refunds (id integer primary key, total integer not null);'

describe.skipIf(!(await postgresTemplateReady('empty')))('the startup read of the record of migrations', () => {
  it('starts on a database the next release migrated by additive files only, and refuses once one is not additive', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth } = await migratedByThisVersion(database)
    await expect(check(auth)).resolves.toBeUndefined()

    const next = withSteps(runtimeModel(auth, {}), { passkeys: 3 })
    await database.exec(recordBlock(row('002_auth', next), null))
    await expect(check(auth)).resolves.toBeUndefined()

    await database.exec(recordBlock(row('003_rename', next, { additive: false, protobaseVersion: '1.2.0' }), null))
    await expect(check(auth)).rejects.toThrow(
      'The database is ahead of Protobase 1.0.0, so the server will not start: it has migrations that break older code since the one this version reads: 003_rename. Rolling back to this version is blocked once they are applied: run Protobase 1.2.0, the version the database matches, or a later one.',
    )
  })

  it('refuses a database the release before left, naming what it lacks, the versions and the two ways out', async () => {
    const database = await openPostgresDatabase('empty')
    const auth = authOn(database)
    await database.exec(recordBlock(row('001_auth', withSteps(runtimeModel(auth, {}), { passkeys: 1 }), { protobaseVersion: '0.9.0' }), null))
    await expect(check(auth)).rejects.toThrow(
      "The database is behind Protobase 1.0.0, so the server will not start: the auth store's passkeys module is at step 1 (passkeys), and this version needs step 2 (rp_id_index). To bring the database up to 1.0.0, run `protobase migrate --plan` to see the migrations it will apply, then `protobase migrate`. Or run Protobase 0.9.0, the version the database matches.",
    )
  })

  it('starts while a plain index is still building, and refuses while a unique one is', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth } = await migratedByThisVersion(database)
    const model = runtimeModel(auth, {})
    await database.exec(recordBlock(row('002_indexes', model, { completed: false, physical: { after: [{ index: 'user_email_idx', unique: false }] } }), null))
    await expect(check(auth)).resolves.toBeUndefined()

    await database.exec(recordBlock(row('003_unique', model, { completed: false, physical: { after: [{ index: 'user_email_key', unique: true }] } }), null))
    await expect(check(auth)).rejects.toThrow("The database's migrations have not finished, so the server will not start: 003_unique has not finished building the unique index user_email_key.")
  })

  it('refuses an app with jobs on a database whose record lacks the jobs schema, and starts once the migration that writes it is applied', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    await expect(check(auth, { jobs: noInput })).rejects.toThrow('the database lacks the jobs schema, which this version needs at step 1 (pg_boss_45)')

    const file = (await migrateWithJobs(project, auth))!
    expect(path.basename(file)).toBe('002_jobs.sql')
    await database.exec(await readFile(file, 'utf8'))
    await expect(check(auth, { jobs: noInput })).resolves.toBeUndefined()
    // The version before, which reads no jobs schema, starts on it too.
    await expect(check(auth)).resolves.toBeUndefined()
    await rm(project, { recursive: true, force: true })
  })

  it('describes with a baseline a jobs schema an earlier migration made, after which the next migration writes nothing', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    await database.exec(jobsSchemaSql())
    await expect(migrateWithJobs(project, auth, database)).rejects.toThrow('The database has the jobs schema, which protobase.snapshot.json does not record: describe it with `protobase migration baseline`')

    const file = await writeBaseline({ projectDir: project, dir: path.join(project, 'db/migrations'), auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, modules: { jobs: noInput }, url: database.url, protobaseVersion: '1.0.0', newId: () => 'baseline-id' })
    const text = await readFile(file, 'utf8')
    expect(text).toContain('-- The jobs schema this version of Protobase needs: at step 1 (pg_boss_45), its functions at version 3.')
    await database.exec(text)
    expect(await migrateWithJobs(project, auth, database)).toBeUndefined()
    await expect(check(auth, { jobs: noInput })).resolves.toBeUndefined()
    await rm(project, { recursive: true, force: true })
  })

  it('refuses an app with events on a database whose record lacks the change capture, starts once the migration writes it, and keeps the triggers of a resource dropped while another is captured', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    await database.exec(tables)
    const captured = [notes.events((e) => e.crud()).toModel(), refunds.toModel()]
    const app = (models: ResourceModel[]) => neededModules({ models, views: [], jobs: [], signIn: true })
    await expect(check(auth, app(captured))).rejects.toThrow('the database lacks the change capture, which this version needs at step 1 (outbox)')

    const file = (await migrateModels(project, auth, captured, 'changes-id'))!
    expect(path.basename(file)).toBe('002_jobs_changes.sql')
    await database.exec(await readFile(file, 'utf8'))
    await expect(check(auth, app(captured))).resolves.toBeUndefined()

    const moved = [notes.toModel(), refunds.events((e) => e.crud()).toModel()]
    const next = (await migrateModels(project, auth, moved, 'moved-id'))!
    const text = await readFile(next, 'utf8')
    expect(text).toContain('-- The triggers that capture the changes of refunds.')
    expect(text).not.toContain('drop trigger if exists "notes_changes"')
    await database.exec(text)
    await expect(check(auth, app(moved))).resolves.toBeUndefined()
    await database.exec('insert into notes values (1, \'kept\')')
    const { rows } = await sql<{ resource: string }>`select resource from changes.outbox`.execute(database.db)
    expect(rows.map((row) => row.resource)).toEqual(['notes'])
    await rm(project, { recursive: true, force: true })
  })

  it('describes with a baseline a change capture an earlier migration made, after which the next migration writes nothing', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    // An update trigger that fires only when columns other than the ignored ones change, whose condition Postgres words otherwise.
    const logs = resource('logs').table('logs').fields({ id: f.integer(), title: f.text(), views: f.integer() }).primaryKey((r) => r.id).history({ ignore: ['views'] })
    const captured = [notes.events((e) => e.crud()).history().toModel(), refunds.toModel(), logs.toModel()]
    await database.exec(`${tables} create table logs (id integer primary key, title text, views integer);\n${jobsSchemaSql()}\n${captureSchemaSql(captured)}`)
    await expect(migrateModels(project, auth, captured, 'refused', database)).rejects.toThrow('The database has the jobs schema, which protobase.snapshot.json does not record')

    const modules = neededModules({ models: captured, views: [], jobs: [], signIn: true })
    const file = await writeBaseline({ projectDir: project, dir: path.join(project, 'db/migrations'), auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, modules, url: database.url, protobaseVersion: '1.0.0', newId: () => 'baseline-id' })
    const text = await readFile(file, 'utf8')
    expect(text).toContain("-- The change capture the resources' events and history need: at step 1 (outbox), its capture at version 1, its triggers of notes, logs.")
    expect(text).toContain('-- The history table of the resources with history: at step 1 (history).')
    await database.exec(text)
    expect(await migrateModels(project, auth, captured, 'nothing', database)).toBeUndefined()
    await expect(check(auth, modules)).resolves.toBeUndefined()
    await rm(project, { recursive: true, force: true })
  })

  it('describes with a baseline the jobs, webhooks, workflows and notifications schemas earlier migrations made, after which the next migration writes nothing', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    const app: Partial<ModuleApp> = { webhooks: { deliveryLog: true }, workflows: { storage: {}, customSteps: true }, notifications: {} }
    // What the migrations of the version before wrote, which wrote the same statements (`written-before-steps.test.ts`).
    await database.exec(`${jobsSchemaSql()}\n${webhooksSchemaSql({ deliveryLog: true })}\n${workflowsSchemaSql({ storage: {}, customSteps: true })}\n${notificationsSchemaSql({}, auth)}`)
    await expect(migrateApp(project, auth, app, 'refused', database)).rejects.toThrow('The database has the jobs schema, which protobase.snapshot.json does not record')

    const modules = featureModules(auth, app)
    const file = await writeBaseline({ projectDir: project, dir: path.join(project, 'db/migrations'), auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, modules, url: database.url, protobaseVersion: '1.0.0', newId: () => 'baseline-id' })
    const text = await readFile(file, 'utf8')
    expect(text).toContain('-- The jobs schema this version of Protobase needs: at step 1 (pg_boss_45), its functions at version 3.')
    expect(text).toContain('-- The webhook subscriptions of webhooks: at step 1 (subscriptions), its functions at version 2.')
    expect(text).toContain("-- The log of every try of the webhook subscriptions' deliveries: at step 1 (delivery_log).")
    expect(text).toContain('-- The workflows, their versions, runs and steps: at step 1 (workflows), its functions at version 28.')
    expect(text).toContain('-- The devices table of notifications: at step 1 (devices).')
    await database.exec(text)
    expect(await migrateApp(project, auth, app, 'nothing', database)).toBeUndefined()
    await expect(check(auth, modules)).resolves.toBeUndefined()
    await rm(project, { recursive: true, force: true })
  })

  it('writes on a fresh database the modules the config turns on and none it leaves off, refuses startup while one is missing, and refuses a schema renamed', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    const webhooks: Partial<ModuleApp> = { webhooks: {} }
    const file = (await migrateApp(project, auth, webhooks, 'webhooks-id'))!
    const text = await readFile(file, 'utf8')
    expect(text).toContain('-- The webhook subscriptions of webhooks.')
    for (const left of ['delivery_log', '"workflows"', '"notifications"']) expect(text).not.toContain(left)
    await database.exec(text)
    await expect(check(auth, featureModules(auth, webhooks))).resolves.toBeUndefined()

    const more: Partial<ModuleApp> = { webhooks: { deliveryLog: true }, workflows: {} }
    await expect(check(auth, featureModules(auth, more))).rejects.toThrow('the database lacks the webhook delivery log, which this version needs at step 1 (delivery_log)')
    const next = await readFile((await migrateApp(project, auth, more, 'more-id'))!, 'utf8')
    expect(next).not.toContain('create table if not exists "webhooks"."subscriptions"')
    await database.exec(next)
    await expect(check(auth, featureModules(auth, more))).resolves.toBeUndefined()

    await expect(migrateApp(project, auth, { webhooks: { schema: 'hooks' } }, 'renamed')).rejects.toThrow(`Not implemented: renaming what a migration made: the webhooks schema's schema is "webhooks" in the snapshot and "hooks" now`)
    await expect(check(auth, featureModules(auth, { webhooks: { schema: 'hooks' } }))).rejects.toThrow(`the webhooks schema's schema is "webhooks" in the database and "hooks" now`)
    await rm(project, { recursive: true, force: true })
  })

  it('describes with a baseline the statuses table, the calls schema, the relay, and the schemas of several processes and SQL sends earlier migrations made, after which the next migration writes nothing', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    const rooms = resource('rooms').table('rooms').fields({ id: f.integer(), members: f.json() }).primaryKey((r) => r.id).live().toModel()
    const channels = { rooms: { members: { field: 'members' } } }
    const app: Partial<ModuleApp> = { models: [rooms], status: {}, calls: {}, realtime: { relay: { channels }, processes: 'many', sqlSends: true } }
    // What the migrations of the version before wrote, which wrote the same statements (`written-before-steps.test.ts`).
    await database.exec(`create table rooms (id integer primary key, members jsonb);\n${jobsSchemaSql()}\n${captureSchemaSql([rooms])}\n${statusSchemaSql({}, auth)}\n${callsSchemaSql()}\n${relaySchemaSql(auth, channels, [rooms])}\n${realtimeRelaySchemaSql()}\n${channelSendsSchemaSql()}`)
    const modules = featureModules(auth, app)
    const file = await writeBaseline({ projectDir: project, dir: path.join(project, 'db/migrations'), auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, modules, url: database.url, protobaseVersion: '1.0.0', newId: () => 'baseline-id' })
    const text = await readFile(file, 'utf8')
    expect(text).toContain("-- The statuses table of people's own status: at step 1 (statuses).")
    expect(text).toContain('at step 2 (guests).')
    expect(text).toContain('realtime.members with the triggers that keep it from the channel records that list their members: at step 1 (members)')
    expect(text).toContain('-- The relay of Realtime broadcasts and presence between the processes serving the app: at step 1 (relay).')
    expect(text).toContain("-- SQL's broadcasts to the record channels, channels.send(): at step 1 (sends)")
    await database.exec(text)
    expect(await migrateApp(project, auth, app, 'nothing', database)).toBeUndefined()
    await expect(check(auth, modules)).resolves.toBeUndefined()
    await rm(project, { recursive: true, force: true })
  })

  it("writes the relay on a fresh database after the auth store's steps in the same file, and refuses startup naming a module missing", async () => {
    const database = await openPostgresDatabase('empty')
    const auth = authOn(database)
    const project = await mkdtemp(path.join(tmpdir(), 'protobase-migration-record-'))
    const relay: Partial<ModuleApp> = { realtime: { relay: { channels: {} } } }
    const text = await readFile((await migrateApp(project, auth, relay, 'fresh-id'))!, 'utf8')
    expect(text.indexOf('-- The auth schema changes this version of Protobase needs.')).toBeLessThan(text.indexOf('create trigger relay_session_ended'))
    await database.exec(text)
    await expect(check(auth, featureModules(auth, relay))).resolves.toBeUndefined()
    await expect(check(auth, featureModules(auth, { ...relay, status: {}, calls: {} }))).rejects.toThrow('the database lacks the statuses table of status, which this version needs at step 1 (statuses)')
    await rm(project, { recursive: true, force: true })
  })

  it('baselines a disabled trigger as one to write again, and a trigger of a resource gone from the config as one to keep, then drop once none is captured', async () => {
    const database = await openPostgresDatabase('empty')
    const { auth, project } = await migratedByThisVersion(database, true)
    const gone = resource('gone').table('gone').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())
    await database.exec(`${tables} create table gone (id integer primary key);\n${jobsSchemaSql()}\n${captureSchemaSql([notes.events((e) => e.crud()).toModel(), refunds.toModel(), gone.toModel()])}`)
    await database.exec('alter table notes disable trigger notes_changes')
    const captured = [notes.events((e) => e.crud()).toModel(), refunds.toModel()]
    const modules = neededModules({ models: captured, views: [], jobs: [], signIn: true })
    const baseline = await writeBaseline({ projectDir: project, dir: path.join(project, 'db/migrations'), auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, modules, url: database.url, protobaseVersion: '1.0.0', newId: () => 'baseline-id' })
    expect(await readFile(baseline, 'utf8')).toContain('its triggers of notes, gone.')
    await database.exec(await readFile(baseline, 'utf8'))

    const next = await readFile((await migrateModels(project, auth, captured, 'next-id', database))!, 'utf8')
    expect(next).toContain('-- The triggers that capture the changes of notes.')
    expect(next).not.toContain('"gone_changes"')
    await database.exec(next)
    const { rows } = await sql<{ enabled: string }>`select tgenabled as enabled from pg_trigger where tgname = 'notes_changes'`.execute(database.db)
    expect(rows).toEqual([{ enabled: 'O' }])

    const last = await readFile((await migrateModels(project, auth, [notes.toModel(), refunds.toModel()], 'last-id', database))!, 'utf8')
    expect(last).toContain('drop trigger if exists "gone_changes" on "public"."gone";')
    await rm(project, { recursive: true, force: true })
  })
})

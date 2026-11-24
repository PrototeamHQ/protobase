import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run, typescriptArgs } from '../../packages/cli/tests/support/auth-project'
import { modelHash, readSnapshot, writeSnapshot } from '../../packages/cli/src/migration/snapshot/snapshot-file'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// A host moves a bundle built on release N to the runtime of release N+1 and brings its database to N+1's own steps with
// `protobase-serve migrate-release`, writing nothing into the project; the project's own `protobase migration` and
// `migrate` later go on without applying a step twice. Release N is this release with the last three steps of the
// mail_senders module unshipped, and the workflows schema of the version before. CLI processes take seconds each.

const runtime = path.join(root, 'packages/cli/src/serve/main.ts')
// Personal mail on, so the store has the mail_senders module.
const configFile = `export default {
  url: 'http://localhost:1',
  secret: 'release-steps-test-secret-release-steps',
  workflows: {},
  auth: { personalMail: ['gmail'], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } },
}
`
const newSteps = ['sender_address_evidence', 'sender_verifications', 'sender_sharing']

// The steps release N did not ship, each a part of the file from its comment to the end of its block.
const withoutNewSteps = (text: string) => text.replace(new RegExp(`-- mail_senders [345] (${newSteps.join('|')}):[\\s\\S]*?end \\$step\\$;\\n\\n`, 'g'), '')

// The project's first migration and snapshot as release N would have written them.
const asReleaseN = async (projectDir: string) => {
  const snapshot = (await readSnapshot(projectDir))!
  const model = structuredClone(snapshot.model)
  model.auth!.modules.mail_senders!.lastStep = 2
  await writeSnapshot(projectDir, { ...snapshot, model, modelHash: modelHash(model) })
  const dir = path.join(projectDir, 'db/migrations')
  const [first] = await readdir(dir)
  const file = path.join(dir, first!)
  const text = withoutNewSteps(await readFile(file, 'utf8')).replace('mail_senders=5', 'mail_senders=2').replace(snapshot.modelHash, modelHash(model))
  await writeFile(file, text)
}

describe.skipIf(!(await postgresTemplateReady('empty')))("protobase-serve migrate-release on a database of the release before", { timeout: 180_000 }, () => {
  let projectDir = ''
  let database: PostgresDatabase
  let refused: PostgresDatabase

  const cli = async (args: string[], url: string) => {
    const result = await run([bin, ...args], projectDir, { DATABASE_URL: url })
    if (result.status !== 0) throw new Error(`protobase ${args.join(' ')} failed:\n${result.stderr}`)
    return result
  }
  const migrateRelease = (url: string, ...args: string[]) => run([...typescriptArgs(runtime), 'migrate-release', path.join(projectDir, 'dist'), ...args], root, { DATABASE_URL: url })
  const rows = async (url: string, query: string) => {
    const sql = postgres(url, { max: 1, onnotice: () => {} })
    const result = [...(await sql.unsafe(query))]
    await sql.end()
    return result
  }
  // The steps of mail_senders the store recorded.
  const versions = async (url: string) => (await rows(url, "select step from auth.auth_steps where module = 'mail_senders' and target = module order by step")).map((row) => row.step as number)
  const sharedAt = async (url: string) => (await rows(url, "select count(*)::int as found from information_schema.columns where table_schema = 'auth' and table_name = 'mail_sender' and column_name = 'shared_at'"))[0]!.found

  // A project and its database on release N: its first migration written, taken back to N and applied, then built.
  const releaseN = async (url: string) => {
    await cli(['migrate'], url)
    // An older version of the workflows functions, which N+1 brings up to date.
    await rows(url, "comment on function workflows.run_version() is 'Protobase workflows 27'")
  }

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    refused = await openPostgresDatabase('empty')
    projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-migrate-release-'))
    await writeFile(path.join(projectDir, 'protobase.config.ts'), configFile)
    await cli(['migration'], database.url)
    await asReleaseN(projectDir)
    await releaseN(database.url)
    await releaseN(refused.url)
    await cli(['build', '--out', 'dist'], database.url)
  }, 300_000)

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true })
    await database?.close()
    await refused?.close()
  }, 30_000)

  it('plans the new auth and workflows steps as SQL, then the row that records the release, applying nothing', async () => {
    const result = await migrateRelease(database.url, '--plan')
    expect(result.status).toBe(0)
    expect(result.stdout.match(/^-- \w+: /gm)).toEqual(['-- auth: ', '-- workflows: ', '-- record: '])
    for (const step of newSteps) expect(result.stdout).toContain(` ${step}: `)
    expect(result.stdout).toMatch(/-- 3 steps to apply; nothing was applied\n$/)
    expect(await versions(database.url)).not.toContain(5)
  })

  it("refuses with the step's own message when the rows break what a step assumes, applying nothing", async () => {
    await rows(refused.url, `insert into auth."user" (id, name, email, email_verified) values ('ann', 'Ann', 'ann@example.com', true);
      insert into auth.mail_sender (id, user_id, address, shared, is_default, created_at) values ('one', 'ann', 'Ann@example.com', false, false, now()), ('two', 'ann', 'ann@example.com', false, false, now())`)
    const result = await migrateRelease(refused.url)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error: The auth store has From addresses entered twice by one person, without regard to case: one, two.')
    expect(await versions(refused.url)).not.toContain(3)
  })

  it('applies them in one transaction, recorded so a second run applies nothing', async () => {
    expect(await migrateRelease(database.url)).toMatchObject({ status: 0, stdout: 'applying auth\napplying workflows\napplying record\napplied 3 steps\n' })
    expect(await versions(database.url)).toEqual([1, 2, 3, 4, 5])
    // Not additive: the workflows step is one of the parts, which may drop what the config no longer has.
    expect(await rows(database.url, "select number, additive, completed_at is not null as completed from migrations.history where name like 'release %'")).toEqual([{ number: null, additive: false, completed: true }])
    expect(await sharedAt(database.url)).toBe(1)
    expect(await migrateRelease(database.url)).toMatchObject({ status: 0, stdout: 'the database is up to date\n' })
  })

  it("lets the project's own migration catch its snapshot up, which its migrate applies without doing a step twice", async () => {
    await cli(['migration'], database.url)
    expect((await readSnapshot(projectDir))!.model.auth!.modules.mail_senders!.lastStep).toBe(5)
    expect((await cli(['migrate'], database.url)).stdout).toMatch(/^applying 002_auth\.sql\napplied 1 migrations\n$/)
    expect(await rows(database.url, "select count(*)::int as rows from auth.auth_steps where module = 'mail_senders' and step = 5")).toEqual([{ rows: 1 }])
  })

  it('applies the same files in full to a new database', async () => {
    const fresh = await openPostgresDatabase('empty')
    await cli(['migrate'], fresh.url)
    expect(await versions(fresh.url)).toEqual([1, 2, 3, 4, 5])
    expect(await sharedAt(fresh.url)).toBe(1)
    await fresh.close()
  })
})

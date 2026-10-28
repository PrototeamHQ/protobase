import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, run } from '../../packages/cli/tests/support/auth-project'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// `protobase migrate` as a process, in a project with only protobase.config.ts and db/migrations: no package.json, nothing
// installed. A fresh CLI process takes seconds on a busy runner.
describe.skipIf(!(await postgresTemplateReady('empty')))('protobase migrate in a config-only project', { timeout: 60_000 }, () => {
  let projectDir = ''
  let database: PostgresDatabase

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-migrate-command-'))
    await writeFile(path.join(projectDir, 'protobase.config.ts'), "export default { url: 'http://localhost:1' }\n")
    await mkdir(path.join(projectDir, 'db/migrations'), { recursive: true })
    await writeFile(path.join(projectDir, 'db/migrations/001_one.sql'), 'create table one (id int primary key);')
    await writeFile(path.join(projectDir, 'db/migrations/002_two.sql'), 'create table two (id int references one);')
  })

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true })
    await database?.close()
  })

  // The connection only through --env, so the run's own DATABASE_URL cannot be the one migrated.
  const migrate = () => run([bin, 'migrate', '--env', 'APP_DATABASE_URL'], projectDir, { DATABASE_URL: '', APP_DATABASE_URL: database.url })

  const rows = async (query: string) => {
    const sql = postgres(database.url, { max: 1, onnotice: () => {} })
    const result = [...(await sql.unsafe(query))]
    await sql.end()
    return result
  }

  it("applies the migrations in order, recorded in migrations.applied as the runtime's migrate records them", async () => {
    const result = await migrate()
    expect(result).toMatchObject({ status: 0, stdout: 'applying 001_one.sql\napplying 002_two.sql\napplied 2 migrations\n' })
    expect(await rows('select name from migrations.applied order by name')).toEqual([{ name: '001_one.sql' }, { name: '002_two.sql' }])
    expect(await rows("select to_regclass('public.two') is not null as made, to_regclass('public.schema_migrations') is null as no_public_record")).toEqual([
      { made: true, no_public_record: true },
    ])
  })

  it('applies nothing on a second run and says the database is up to date', async () => {
    expect(await migrate()).toMatchObject({ status: 0, stdout: 'the database is up to date\n' })
    expect(await rows('select count(*)::int as applied from migrations.applied')).toEqual([{ applied: 2 }])
  })
})

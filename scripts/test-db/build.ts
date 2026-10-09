import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { connectServer, databaseUrl, sourceHash, templates, templateState, type Template } from './templates'

// `pnpm test:db [--force]`: builds the test templates that are missing or older than their migrations and seed
// (every one with --force). Test runs clone these; they never write to the developer databases.

const root = path.join(import.meta.dirname, '..', '..')
const force = process.argv.includes('--force')

const run = (template: Template, script: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: path.join(root, template.dir),
    env: { ...process.env, DATABASE_URL: databaseUrl(template.database) },
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`${script} failed for ${template.database}`)
}

const build = async (template: Template) => {
  const sql = connectServer()
  const [existing] = await sql`select 1 from pg_database where datname = ${template.database}`
  if (existing) {
    // A template database cannot be dropped until it is an ordinary one again.
    await sql.unsafe(`alter database "${template.database}" with is_template false`)
    await sql.unsafe(`drop database "${template.database}" with (force)`)
  }
  await sql.unsafe(`create database "${template.database}"`)
  run(template, 'db/migrate.ts')
  run(template, 'seed/cli.ts', '--scale', template.scale)
  await sql.unsafe(`comment on database "${template.database}" is '${await sourceHash(template)}'`)
  // No connections, so nothing can ever keep a test run from cloning it.
  await sql.unsafe(`alter database "${template.database}" with is_template true allow_connections false`)
  await sql.end()
}

for (const template of Object.values(templates)) {
  const state = await templateState(template)
  if (state === 'unreachable') throw new Error('No Postgres server: start it with `pnpm --filter erp db:up`, or set TEST_POSTGRES_URL')
  if (state === 'ready' && !force) {
    console.log(`${template.database} is up to date`)
    continue
  }
  await build(template)
  console.log(`built ${template.database} (${template.scale})`)
}

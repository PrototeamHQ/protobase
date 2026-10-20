import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fillSnapshotTemplate, realPostgresTemplates, snapshotTemplates, type SnapshotTemplateKey } from './snapshot-templates'
import { connectServer, databaseUrl, serverVariable, sourceHash, suites, templates, templateServer, templateState, type Template } from './templates'

// `bun run test:db [suite] [--force]`: builds the suite's test templates (the integration tests' when no suite is named)
// that are missing or older than what they are built from, every one with --force. Test runs clone these; they never
// write to the developer databases. The integration suite includes the templates the real-Postgres tests clone; the
// `snapshots` suite is what `bun run test:record` records on.

const root = path.join(import.meta.dirname, '..', '..')
const force = process.argv.includes('--force')
const suite = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'integration'

const run = (dir: string, database: string, script: string, ...args: string[]) => {
  const result = spawnSync('bun', [script, ...args], {
    cwd: path.join(root, dir),
    env: { ...process.env, DATABASE_URL: databaseUrl(database) },
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`${script} failed for ${database}`)
}

type Buildable = { template: Template; fill: () => Promise<void> }

const example = (template: (typeof templates)[keyof typeof templates]): Buildable => ({
  template,
  fill: async () => {
    run(template.dir, template.database, 'db/migrate.ts')
    run(template.dir, template.database, 'seed/cli.ts', '--scale', template.scale)
  },
})

const snapshot = (key: SnapshotTemplateKey): Buildable => ({
  template: snapshotTemplates[key],
  fill: () => fillSnapshotTemplate(key, databaseUrl(snapshotTemplates[key].database, templateServer(snapshotTemplates[key]))),
})

const buildables: Record<string, Buildable[]> = {
  ...Object.fromEntries(Object.entries(suites).map(([name, keys]) => [name, keys.map((key) => example(templates[key]))])),
  integration: [...suites.integration.map((key) => example(templates[key])), ...realPostgresTemplates.map(snapshot)],
  snapshots: (Object.keys(snapshotTemplates) as SnapshotTemplateKey[]).map(snapshot),
}
if (!buildables[suite]) throw new Error(`No test suite ${suite}: name one of ${Object.keys(buildables).join(', ')}`)

const build = async ({ template, fill }: Buildable) => {
  const sql = connectServer(2, templateServer(template))
  const [existing] = await sql`select 1 from pg_database where datname = ${template.database}`
  if (existing) {
    // A template database cannot be dropped until it is an ordinary one again.
    await sql.unsafe(`alter database "${template.database}" with is_template false`)
    await sql.unsafe(`drop database "${template.database}" with (force)`)
  }
  await sql.unsafe(`create database "${template.database}"`)
  await fill()
  await sql.unsafe(`comment on database "${template.database}" is '${await sourceHash(template)}'`)
  // No connections, so nothing can ever keep a test run from cloning it.
  await sql.unsafe(`alter database "${template.database}" with is_template true allow_connections false`)
  await sql.end()
}

for (const buildable of buildables[suite]) {
  const { template } = buildable
  const state = await templateState(template)
  if (state === 'unreachable') throw new Error(`No Postgres server for ${template.database}: start it with \`bun run db:up\`, or set ${serverVariable(template)}`)
  if (state === 'ready' && !force) {
    console.log(`${template.database} is up to date`)
    continue
  }
  await build(buildable)
  console.log(`built ${template.database}${template.scale ? ` (${template.scale})` : ''}`)
}

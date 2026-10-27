import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { bin, root, run } from '../../../packages/cli/tests/support/auth-project'
import { freePort } from '../../../packages/cli/tests/support/database'
import { stopProcess, untilPrinted } from '../../../packages/cli/tests/support/serve-process'
import { databaseUrl, serverUrl } from '../../../scripts/test-db/templates'

// pg_dump and psql of the source's major version or newer: PG_BIN's, or else Docker's postgres:18 (pg-tools/).
const pgTools = process.env.PG_BIN ?? path.join(import.meta.dirname, 'pg-tools')

// A new app as `npm create protobase` writes the scratch preset: the files of tests/apps/scratch that git tracks. It
// lives under tests/supabase-move/runs/, inside the repository, so it resolves its packages from the workspace's, as an
// installed app does from its own node_modules: the @protobase packages and the @supabase/supabase-js that the
// converted function imports and the import report says to install.
const newApp = async (projectDir: string) => {
  const scratch = path.join(root, 'tests/apps/scratch')
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: scratch, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const file of files) {
    await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
    await cp(path.join(scratch, file), path.join(projectDir, file))
  }
  // The Supabase project's checkout beside it: its Edge Functions.
  await cp(path.join(import.meta.dirname, 'project'), projectDir, { recursive: true })
}

/**
 * The sample Supabase project at `sourceUrl` moved into a new app on a database of its own, as the docs of
 * `protobase import supabase` and its report tell a developer to, then served by `protobase dev`. Each step of the move
 * is in `steps`, in order. `dispose` stops the server and drops the app and its database.
 */
export const moveApp = async ({ sourceUrl, storageUrl, storageKey }: { sourceUrl: string; storageUrl: string; storageKey: string }) => {
  const id = randomBytes(4).toString('hex')
  const projectDir = path.join(root, 'tests/supabase-move/runs', `client-${id}`)
  const database = `supabase_move_app_${id}`
  const server = postgres(serverUrl, { max: 1, onnotice: () => {} })
  await server.unsafe(`create database ${database}`)
  await newApp(projectDir)

  const port = await freePort()
  const settings = {
    DATABASE_URL: databaseUrl(database),
    PROTOBASE_URL: `http://localhost:${port}`,
    PROTOBASE_SECRET: randomBytes(32).toString('base64'),
    PROTOBASE_PUBLISHABLE_KEY: `sb_publishable_${randomBytes(16).toString('hex')}`,
    PROTOBASE_SECRET_KEY: `sb_secret_${randomBytes(16).toString('hex')}`,
  }
  await writeFile(path.join(projectDir, '.env'), Object.entries(settings).map(([name, value]) => `${name}=${value}\n`).join(''))
  // The same settings over any the test's own environment holds, which a command would take over its .env.
  const env = { ...settings, PATH: [pgTools, process.env.PATH].join(path.delimiter) }

  const steps: string[] = []
  const step = async (title: string, args: string[], extra: Record<string, string> = {}) => {
    const result = await run([bin, ...args], projectDir, { ...env, ...extra })
    if (result.status !== 0) throw new Error(`${title} failed:\n${result.stdout}\n${result.stderr}`)
    steps.push(title)
  }
  await step('protobase import supabase <source>', ['import', 'supabase', sourceUrl])
  await step('bun run db:migrate', ['run', 'db/migrate.ts'])
  await step('protobase import supabase --storage-url <project>', ['import', 'supabase', '--storage-url', storageUrl], { SUPABASE_SERVICE_ROLE_KEY: storageKey })
  await step('bun run db:migrate', ['run', 'db/migrate.ts'])
  // The report's "Live tables": the capture triggers of the tables the publication held.
  await step('protobase migration', ['migration'])
  await step('bun run db:migrate', ['run', 'db/migrate.ts'])
  const report = await readFile(path.join(projectDir, 'supabase-import/report.md'), 'utf8')

  const cacheDir = await mkdtemp(path.join(tmpdir(), 'protobase-supabase-move-'))
  let child: ChildProcess | undefined = spawn(process.execPath, [bin, 'dev', '--port', String(port), '--cache-dir', cacheDir], { cwd: projectDir, env: { ...process.env, ...env } })
  await untilPrinted(child, 'protobase dev ready', 90_000)
  steps.push('bun run dev')

  const dispose = async () => {
    await stopProcess(child)
    child = undefined
    await rm(cacheDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
    await server.unsafe(`drop database if exists ${database} with (force)`)
    await server.end()
  }
  return { base: `${settings.PROTOBASE_URL}/api/sb`, publishableKey: settings.PROTOBASE_PUBLISHABLE_KEY, secretKey: settings.PROTOBASE_SECRET_KEY, steps, report, dispose }
}

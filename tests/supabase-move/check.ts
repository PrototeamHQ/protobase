// Whether the supabase-move skill finishes a move: imports sample/source.sql's Supabase app with sample/project's Edge
// Functions into a copy of the project, adds the developer's own views of sample/views, has a coding agent finish it
// with the skill, then checks that the project's typecheck and `protobase doctor` pass and that nothing the report
// listed is left. The sample carries one of each item the report leaves for a person, on a target database without
// pg_net, pg_cron, Vault or pg_hashids, such as plain Postgres. It spends the agent's subscription and its result varies
// from run to run, so it is no part of CI: run it by hand after changing the skill or the report.
//
//   SOURCE_URL=postgres://postgres:...@host/postgres   a fresh Supabase database (supabase/postgres, with Supabase's init)
//   DATABASE_URL=postgres://...@host/postgres          a fresh, empty target database
//   AGENT='claude -p --permission-mode bypassPermissions'   the agent, given the prompt as its last argument (default)
//   PG_BIN=/opt/homebrew/opt/libpq/bin                 pg_dump and psql of the source's major version or newer, if not on PATH
//   bun tests/supabase-move/check.ts
//
// The project stays in tests/supabase-move/runs/<time>/, with the agent's output in agent.log.
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; see tests/supabase-move/check.ts`)
  return value
}

const sourceUrl = required('SOURCE_URL')
const databaseUrl = required('DATABASE_URL')
const agent = (process.env.AGENT ?? 'claude -p --permission-mode bypassPermissions').split(' ')
const root = path.resolve(import.meta.dirname, '../..')
const sample = path.join(import.meta.dirname, 'sample')
const projectDir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replaceAll(':', '-'))
const protobase = path.join(root, 'node_modules/.bin/protobase')
const env = { ...process.env, DATABASE_URL: databaseUrl, PATH: [process.env.PG_BIN, path.join(root, 'node_modules/.bin'), process.env.PATH].filter(Boolean).join(path.delimiter) }

const run = (command: string, args: string[], options: { cwd?: string; output?: 'inherit' | 'pipe' } = {}) => {
  const result = spawnSync(command, args, { cwd: options.cwd ?? projectDir, env, stdio: ['ignore', options.output ?? 'inherit', options.output ?? 'inherit'], encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

const step = (title: string, command: string, args: string[]) => {
  process.stdout.write(`\n== ${title}\n`)
  if (run(command, args).status !== 0) throw new Error(`${title} failed`)
}

const sql = (query: string) => {
  const result = run('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', query], { output: 'pipe' })
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`)
  return result.stdout.trim()
}

const sourceFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true, recursive: true })).filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)).map((entry) => path.join(entry.parentPath, entry.name))

// The move, as a developer makes it: the sample into a project of its own, the import's two runs, the skill.
await cp(path.join(sample, 'project'), projectDir, { recursive: true })
await mkdir(path.join(projectDir, 'db/migrations'))
await writeFile(path.join(projectDir, '.env'), `DATABASE_URL=${databaseUrl}\n`)
step('The Supabase app', 'psql', [sourceUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(sample, 'source.sql')])
step('protobase import supabase, first run', protobase, ['import', 'supabase', sourceUrl])
step('Migrations', 'bun', ['run', 'db:migrate'])
step('protobase import supabase, second run', protobase, ['import', 'supabase'])
// The developer's own views, which the report's doctor run did not see: a related list no index serves yet.
await cp(path.join(sample, 'views'), path.join(projectDir, 'config'), { recursive: true })
step('protobase skill install', protobase, ['skill', 'install'])

process.stdout.write('\n== The agent, with the supabase-move skill (agent.log)\n')
const prompt = 'Finish this project\'s move from Supabase with the supabase-move skill. The database is DATABASE_URL in .env. Work on your own: there is nobody to ask, so where the skill says to stop on an item and tell the user, do so in your last message and go on with the rest.'
const [agentCommand, ...agentArgs] = agent
const moved = run(agentCommand!, [...agentArgs, prompt], { output: 'pipe' })
await writeFile(path.join(projectDir, 'agent.log'), `${moved.stdout}\n${moved.stderr}`)
process.stdout.write(`${moved.stdout.trim().split('\n').slice(-40).join('\n')}\n`)

// What a finished move holds.
const functionsCode = (await Promise.all((await sourceFiles(path.join(projectDir, 'functions'))).map((file) => readFile(file, 'utf8')))).join('\n')
const envExample = await readFile(path.join(projectDir, '.env.example'), 'utf8').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return ''
  throw error
})
const checks: Array<[string, () => boolean]> = [
  ['the migrations apply', () => run('bun', ['run', 'db:migrate']).status === 0],
  ['protobase migration has nothing left to write', () => run(protobase, ['migration'], { output: 'pipe' }).stdout.includes('nothing to write')],
  ['the typecheck passes', () => run('bun', ['run', 'typecheck']).status === 0],
  ['protobase doctor passes', () => run(protobase, ['doctor', '--env', 'DATABASE_URL']).status === 0],
  ['no Deno, EdgeRuntime, Supabase.ai or deno.land/x import is left in functions/', () => !/\bDeno\.|\bEdgeRuntime\.|\bSupabase\.ai\b|['"]https:\/\/deno\.land\/x\//.test(functionsCode)],
  ['nothing in the database calls pg_net or Vault', () => sql("select count(*) from pg_proc where prosrc ~ '(net\\.http_|vault\\.)' and pronamespace not in (select oid from pg_namespace where nspname in ('net', 'vault'))") === '0'],
  ['nothing in the database calls pg_hashids', () => sql("select count(*) from pg_proc where prosrc ~ 'id_encode|id_decode'") === '0'],
  ['.env.example names the Vault secret, without its value', () => /^DIGEST_TOKEN=\s*$/m.test(envExample) && !envExample.includes('tok_live_123')],
]

process.stdout.write('\n== Checks\n')
const failed = checks.filter(([title, check]) => {
  const passed = check()
  process.stdout.write(`${passed ? 'pass' : 'FAIL'}  ${title}\n`)
  return !passed
})
process.stdout.write(`\nThe project: ${projectDir}\n`)
process.exitCode = failed.length === 0 ? 0 : 1

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { bin, createAuthProject, root } from '../support/auth-project'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const hasApp = ['index.html', 'main.tsx'].every((file) => existsSync(path.join(root, 'packages/ui/src/app', file)))

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

// The auth project's config with a job a test enqueues and one scheduled every minute.
const configFile = `export default ({ env }: { env: Record<string, string | undefined> }) => ({
  url: 'http://localhost:1',
  secret: 'integration-test-secret-integration-test',
  auth: { schema: env.TEST_AUTH_SCHEMA },
  authenticate: { tenant: 1 },
  jobs: { note: {}, tick: { schedule: '* * * * *' } },
})
`
const jobFile = 'export default async () => {}\n'

// Starts `protobase dev` with `args` in a project with jobs, over a fresh clone of the jobs template, and hands the
// test its database and startup banner; stops the server and drops the database after it.
const withDev = async (args: string[], test: (database: Awaited<ReturnType<typeof openPostgresDatabase>>, banner: string) => Promise<void>) => {
  const database = await openPostgresDatabase('jobs')
  const project = await createAuthProject(database.url)
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'protobase-dev-cache-'))
  let child: ChildProcess | undefined
  try {
    await mkdir(path.join(project.projectDir, 'jobs'))
    await writeFile(path.join(project.projectDir, 'protobase.config.ts'), configFile)
    await writeFile(path.join(project.projectDir, 'jobs/note.ts'), jobFile)
    await writeFile(path.join(project.projectDir, 'jobs/tick.ts'), jobFile)
    child = spawn(process.execPath, [bin, 'dev', '--port', String(await freePort()), '--cache-dir', cacheDir, ...args], {
      cwd: project.projectDir,
      env: { ...process.env, ...project.env },
    })
    const banner = await new Promise<string>((resolve, reject) => {
      let output = ''
      const collect = (chunk: Buffer) => {
        output += chunk
        if (output.includes('protobase dev ready')) resolve(output)
      }
      child!.stdout?.on('data', collect)
      child!.stderr?.on('data', collect)
      child!.once('exit', (code) => reject(new Error(`protobase dev exited with ${code}:\n${output}`)))
    })
    await test(database, banner)
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child!.once('exit', resolve))
      child.kill('SIGTERM')
      await exited
    }
    await rm(cacheDir, { recursive: true, force: true })
    await project.dispose()
  }
}

const state = async (database: Awaited<ReturnType<typeof openPostgresDatabase>>, id: string) =>
  (await sql<{ state: string }>`select state from jobs.job where id = ${id}::uuid`.execute(database.db)).rows[0]?.state
// The runs of the scheduled jobs, which the jobs runtime enqueues ahead as it starts.
const scheduledRuns = async (database: Awaited<ReturnType<typeof openPostgresDatabase>>) =>
  (await sql<{ name: string }>`select name from jobs.job where singleton_key = 'protobase.schedule'`.execute(database.db)).rows.map((row) => row.name)
const enqueue = async (database: Awaited<ReturnType<typeof openPostgresDatabase>>) =>
  (await sql<{ id: string }>`select jobs.enqueue('note')::text as id`.execute(database.db)).rows[0]!.id

// Event and webhook delivery are jobs of the same runtime, which --no-jobs never starts.
describe.skipIf(!hasApp || !(await postgresTemplateReady('jobs')))('protobase dev --no-jobs', () => {
  it('runs no queued or scheduled job and says so in its banner', async () => {
    await withDev(['--no-jobs'], async (database, banner) => {
      expect(banner).toContain('jobs     off')
      const id = await enqueue(database)
      // Two poll intervals of a running worker.
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      expect(await state(database, id)).toBe('created')
      expect(await scheduledRuns(database)).toEqual([])
    })
  }, 120_000)

  it('runs jobs and their schedules without it', async () => {
    await withDev([], async (database, banner) => {
      expect(banner).not.toContain('jobs     off')
      const id = await enqueue(database)
      await expect.poll(() => state(database, id), { timeout: 15_000, interval: 500 }).toBe('completed')
      expect(await scheduledRuns(database)).toContain('tick')
    })
  }, 120_000)
})

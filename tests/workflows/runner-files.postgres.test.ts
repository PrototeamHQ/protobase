import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsSchemaSql, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { localFiles, schemaModules, workflowsModule } from '@protobase/server/internal'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { definitionFields } from '../../test-support/workflow-fields'
import { appClient } from '../../packages/runner/src/app'
import { testRunner } from './support/test-runner'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_custom_steps' | 'workflow_custom_step_versions' | 'workflow_runners' | 'workflow_custom_step_jobs' | 'workflow_custom_step_builds' | 'storage_configurations'>({
  keeper: ['workflows.*', 'workflow_runs.*', 'workflow_custom_steps.*', 'workflow_custom_step_versions.read', 'workflow_runners.*', 'workflow_custom_step_jobs.read', 'workflow_custom_step_builds.read', 'storage_configurations.*'],
  author: ['workflows.*', 'workflow_runs.*', 'storage_configurations.read'],
})
// Ada keeps the custom steps, the runners and the storage; Bob writes and publishes the workflows; Eve is of another tenant.
const people: Record<string, { roles: string[]; tenant: string }> = { ada: { roles: ['keeper'], tenant: '1' }, bob: { roles: ['author'], tenant: '1' }, eve: { roles: ['keeper'], tenant: '2' } }

process.env.PROTOBASE_SECRET = 'runner-files-test-secret-0123456789abcdef'

const convert = {
  name: 'convert',
  label: 'Convert a video',
  container: { dockerfile: 'FROM debian:bookworm-slim\nCOPY convert.sh /usr/local/bin/convert\n', files: { 'convert.sh': '#!/bin/sh\n' }, command: ['convert'] },
  input: { type: 'object', required: ['video'], properties: { video: { 'x-file': true }, height: { type: 'integer' } } },
  output: { type: 'object', required: ['video'], properties: { video: { 'x-file': true }, seconds: { type: 'number' } } },
}
const step = 'custom:convert:1'

const converting = (store: Record<string, unknown>) => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Convert',
    States: { Convert: { Type: 'Task', Resource: step, Arguments: { video: '{% $states.context.Execution.Input.video %}', height: 720, store }, End: true } },
  },
})

describe.skipIf(!(await postgresTemplateReady('jobs')))("runners' job files, builds and prepare on the app's database", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let folder: Awaited<ReturnType<typeof tempDir>>
  let workflow: string
  const errors: unknown[] = []
  const video = { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 12 }
  const workflows = (root: string): WorkflowsOptions => ({ savedByRoles: async ({ id }) => people[id]?.roles ?? [], customSteps: true, storage: { root }, runners: { claimSeconds: 1, leaseSeconds: 5, coldWaitSeconds: 0, warmWaitSeconds: 0 } })

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    const options = workflows(join(folder.dir, 'storage'))
    await pg.exec(workflowsSchemaSql(options))
    const { resources, views } = configExports(workflowsModule(options))
    // Storage configurations' keys are encrypted fields, which need a key to start, though local ones have none.
    vi.stubEnv('PROTOBASE_ENCRYPTION_KEY', Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64'))
    admin = createAdmin({
      resources, views, db, workflows: options,
      files: { providers: { private: localFiles({ dir: join(folder.dir, 'private') }) }, secret: 'files-secret-for-the-runner-tests' },
      authenticate: (request) => {
        const person = people[request.headers.get('x-user')!]!
        return { user: { id: request.headers.get('x-user')!, roles: person.roles }, tenant: person.tenant }
      },
      options: { statementTimeoutMs, roles },
    })
    vi.unstubAllEnvs()
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    expect((await as('ada', '/storage_configurations', { method: 'POST', body: { name: 'videos', kind: 'local', dir: 'videos' } })).status).toBe(201)
    expect((await as('ada', '/workflow_custom_steps', { method: 'POST', body: convert })).status).toBe(201)
    await mkdir(join(folder.dir, 'storage', 'videos', 'in'), { recursive: true })
    await writeFile(join(folder.dir, 'storage', 'videos', 'in', 'sample.mp4'), 'sample video')
    workflow = String((await created('bob', '/workflows', { name: 'Convert videos', ...definitionFields(converting({ configuration: 'videos' })) })).id)
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const created = async (user: string, path: string, body: unknown) => {
    const response = await as(user, path, { method: 'POST', body })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()) as Record<string, unknown>
  }
  const fetch = (path: string, init: RequestInit) => admin.request(path, init)
  const registered = async (name: string, user = 'ada') => {
    const runner = await created(user, '/workflow_runners', { name })
    const { token } = (await (await as(user, `/api/workflows/runners/${String(runner.id)}/registration`, { method: 'POST' })).json()) as { token: string }
    const machine = testRunner(fetch)
    expect((await machine.register(token)).status).toBe(200)
    // The job's files, by the addresses the claim gives, with the runner's own token
    const file = (path: string, init: RequestInit = {}) => admin.request(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${machine.token}` } })
    return Object.assign(machine, { id: String(runner.id), file })
  }
  const run = async (id: string) => (await sql<{ status: string; output: unknown; error: string | null; cause: string | null }>`select status, output, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const ended = async (id: string) => {
    await vi.waitFor(async () => expect((await run(id)).status).toMatch(/succeeded|failed/), { timeout: 20_000, interval: 50 })
    return run(id)
  }
  const start = async (input: unknown) => String((await created('bob', '/workflow_runs', { workflow_id: workflow, input })).id)
  // Once the run's job is queued, which its segment does in the background, however long that takes
  const queued = (id: string) => vi.waitFor(async () => expect((await sql<{ status: string }>`select status from workflows.custom_step_jobs where run_id = ${id}`.execute(db)).rows).toEqual([{ status: 'queued' }]), { timeout: 20_000, interval: 50 })

  it('adds the builds and wanted tables with custom steps, which the custom steps module records at its last step', async () => {
    const { rows } = await sql<{ builds: boolean; wanted: boolean }>`select to_regclass('workflows.custom_step_builds') is not null as builds, to_regclass('workflows.custom_step_wanted') is not null as wanted`.execute(db)
    expect(rows[0]).toEqual({ builds: true, wanted: true })
    expect(await schemaModules.workflow_custom_steps.read(db, { names: { schema: 'workflows' }, resources: {} })).toEqual({ lastStep: 1, replaceables: { functions: 1 }, names: { schema: 'workflows' } })
  })

  it('gives the job its input files and build, streams them to the runner holding it, stores what it gives, and refuses both once it ended', async () => {
    const machine = await registered('Converter')
    const other = await registered('Other')
    const id = await start({ video })
    const job = await machine.claimJob()
    expect(job.files).toEqual([{ input: 'video', name: 'sample.mp4', type: 'video/mp4', size: 12, url: `/api/runners/v1/jobs/${job.id}/inputs/video` }])
    expect(job.output_files).toEqual(['video'])
    expect(job.build).toEqual({ dockerfile: convert.container.dockerfile, files: convert.container.files, command: ['convert'] })
    expect(job.command).toEqual(['convert'])

    const input = await machine.file(job.files[0]!.url)
    expect([input.status, input.headers.get('content-type'), await input.text()]).toEqual([200, 'video/mp4', 'sample video'])
    // Only the runner holding the job, and only its inputs
    expect((await other.file(job.files[0]!.url)).status).toBe(409)
    expect((await admin.request(job.files[0]!.url)).status).toBe(401)
    expect((await machine.file(`/api/runners/v1/jobs/${job.id}/inputs/height`)).status).toBe(404)

    const put = (as: typeof machine, path: string, body: string) => as.file(`/api/runners/v1/jobs/${job.id}/outputs/${path}`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body })
    expect((await put(other, 'clip-720.mp4', 'stolen')).status).toBe(409)
    expect((await put(machine, '..%2Fescape.mp4', 'escape')).status).toBe(400)
    expect((await put(machine, '.hidden', 'hidden')).status).toBe(400)
    const stored = await put(machine, 'out/clip-720.mp4', '720p video')
    expect(stored.status).toBe(200)
    const file = (await stored.json()) as { configuration: string; path: string; name: string; type: string; size: number }
    // At the step's own path in its run, by the path the container gave it
    expect(file).toMatchObject({ configuration: 'videos', path: expect.stringMatching(new RegExp(`^runs/${id}/[0-9a-f]{32}/out/clip-720\\.mp4$`)), name: 'clip-720.mp4', type: 'video/mp4', size: 10 })
    expect(await readFile(join(folder.dir, 'storage', 'videos', file.path), 'utf8')).toBe('720p video')

    expect((await machine.complete(job.id, { output: { video: file, seconds: 2 } })).status).toBe(200)
    expect(await ended(id)).toMatchObject({ status: 'succeeded', output: { video: file, seconds: 2 } })
    // The addresses end with the job
    expect((await machine.file(job.files[0]!.url)).status).toBe(409)
    expect((await put(machine, 'late.mp4', 'late')).status).toBe(409)
  })

  it("stores under the store argument's path, and refuses an input file of the app's that the run did not give", async () => {
    const machine = await registered('Pathed')
    const pathed = String((await created('bob', '/workflows', { name: 'Convert into a folder', ...definitionFields(converting({ configuration: 'videos', path: 'converted/today' })) })).id)
    const id = String((await created('bob', '/workflow_runs', { workflow_id: pathed, input: { video } })).id)
    const job = await machine.claimJob()
    const stored = await machine.file(`/api/runners/v1/jobs/${job.id}/outputs/clip.mp4`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: 'clip' })
    expect(await stored.json()).toMatchObject({ configuration: 'videos', path: 'converted/today/clip.mp4' })
    expect((await machine.complete(job.id, { error: 'Custom.Failed', cause: 'exit code 1' })).status).toBe(200)
    expect(await ended(id)).toMatchObject({ status: 'failed', error: 'Custom.Failed', cause: 'exit code 1' })

    // A file value of the app's that is no file of this run is refused to the runner holding its job
    const foreign = await start({ video: { uri: 'private:workflows/another-run/secret', name: 'secret', type: 'text/plain', size: 1 } })
    const taken = await machine.claimJob()
    const refused = await machine.file(taken.files[0]!.url)
    expect([refused.status, ((await refused.json()) as { title: string }).title]).toEqual([400, 'States.TaskFailed'])
    expect((await machine.complete(taken.id, { error: 'Custom.Failed' })).status).toBe(200)
    await ended(foreign)
    // An argument that is no file fails its Task as its job is placed, before any runner has it; the claim it was
    // placed with stays held, and takes the next job. Both are queued before the one claim, whatever the time it takes.
    const notFile = await start({ video: 'https://example.com/a.mp4' })
    await queued(notFile)
    const after = await start({ video })
    await queued(after)
    const next = await machine.claim()
    expect(next?.input).toMatchObject({ video })
    expect((await machine.complete(next!.id, { error: 'Custom.Failed' })).status).toBe(200)
    await ended(after)
    expect(await ended(notFile)).toMatchObject({ status: 'failed', error: 'Storage.InvalidArguments' })
  })

  it('keeps each build a runner reports, of its own tenant\'s versions only, listed by version', async () => {
    const machine = await registered('Reporter')
    const start = await machine.raw('/builds', { step, status: 'building' })
    const { id } = (await start.json()) as { id: string }
    expect((await machine.raw('/builds', { step, status: 'ready', digest: 'sha256:abc', log: `${'x'.repeat(20_000)}done` })).status).toBe(200)
    const { rows } = await sql<{ id: string; status: string; digest: string; log: string; finished_at: Date | null }>`select id, status, digest, log, finished_at from workflows.custom_step_builds where runner_id = ${machine.id}`.execute(db)
    expect(rows).toEqual([{ id, status: 'ready', digest: 'sha256:abc', log: expect.stringMatching(/done$/), finished_at: expect.any(Date) }])
    expect(rows[0]!.log).toHaveLength(10_000)
    expect((await machine.raw('/builds', { step: 'custom:convert:9', status: 'building' })).status).toBe(404)
    expect((await machine.raw('/builds', { step, status: 'done' })).status).toBe(400)
    const version = (await sql<{ id: string }>`select id from workflows.custom_step_versions where name = 'convert' and version = 1`.execute(db)).rows[0]!.id
    const listed = (await (await as('ada', `/workflow_custom_step_builds?filter=${encodeURIComponent(`version_id = "${version}"`)}`)).json()) as { items: { id: string; status: string }[] }
    expect(listed.items.map((build) => [build.id, build.status])).toContainEqual([id, 'ready'])
    expect(((await (await as('eve', '/workflow_custom_step_builds')).json()) as { items: unknown[] }).items).toEqual([])
    expect((await as('bob', '/workflow_custom_step_builds')).status).not.toBe(200)
    await sql`delete from workflows.custom_step_builds`.execute(db)
  })

  it("has runners that build prepare the versions a published workflow uses and each custom step's current one, once each until they have the image or its build failed", async () => {
    const etag = async () => (await as('bob', `/workflows/${workflow}`)).headers.get('etag')!
    const publish = (version: number | null) => admin.request(`/api/v1/workflows/${workflow}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-user': 'bob', 'if-match': '*' }, body: JSON.stringify({ enabled_version: version }) })
    expect(await etag()).toBeTruthy()
    expect((await publish(1)).status).toBe(200)
    const wanted = await sql<{ step: string }>`select 'custom:' || v.name || ':' || v.version as step from workflows.custom_step_wanted w join workflows.custom_step_versions v on v.id = w.version_id where w.workflow_id = ${workflow}`.execute(db)
    expect(wanted.rows).toEqual([{ step }])

    const builder = await registered('Builder')
    const building = { kinds: ['container', 'build'] }
    const order = (await (await builder.raw('/claim', { platform: 'linux/amd64', capacity: { slots: 1 }, ...building })).json()) as Record<string, unknown>
    expect(order).toEqual({ order: 'prepare', step, build: { dockerfile: convert.container.dockerfile, files: convert.container.files, command: ['convert'] } })
    expect((await sql<{ status: string }>`select status from workflows.custom_step_builds where runner_id = ${builder.id}`.execute(db)).rows).toEqual([{ status: 'building' }])
    // Once sent, not again while it builds, nor once its build failed
    expect(await builder.claim(building)).toBeUndefined()
    expect((await builder.raw('/builds', { step, status: 'building' })).status).toBe(200)
    expect((await builder.raw('/builds', { step, status: 'failed', log: 'E: no such package' })).status).toBe(200)
    expect(await builder.claim(building)).toBeUndefined()
    expect((await sql<{ status: string; log: string }>`select status, log from workflows.custom_step_builds where runner_id = ${builder.id}`.execute(db)).rows).toEqual([{ status: 'failed', log: 'E: no such package' }])

    // A runner that builds nothing, or has the image, is sent none
    const plain = await registered('Plain')
    expect(await plain.claim()).toBeUndefined()
    const hot = await registered('Hot')
    expect(await hot.claim({ ...building, images: [{ step }] })).toBeUndefined()
    // Another runner that builds is sent it once
    const second = await registered('Second')
    expect(((await (await second.raw('/claim', { platform: 'linux/amd64', capacity: { slots: 1 }, ...building })).json()) as { order: string }).order).toBe('prepare')
    expect(await second.claim(building)).toBeUndefined()

    // Turning the workflow off wants nothing of it, but the custom step's current version, its last save, is built still
    expect((await publish(null)).status).toBe(200)
    expect((await sql`select 1 from workflows.custom_step_wanted where workflow_id = ${workflow}`.execute(db)).rows).toEqual([])
    const third = await registered('Third')
    expect(await third.raw('/claim', { platform: 'linux/amd64', capacity: { slots: 1 }, ...building }).then((response) => response.json())).toMatchObject({ order: 'prepare', step })
    // Once a later save makes another version current, the one no published workflow uses is wanted no more
    const { rows: [saved] } = await sql<{ id: string }>`select id from workflows.custom_steps where name = 'convert'`.execute(db)
    expect((await as('ada', `/workflow_custom_steps/${saved!.id}`, { method: 'PATCH', body: { container: { ...convert.container, dockerfile: `${convert.container.dockerfile}\n# 2` } } })).status).toBe(200)
    const fourth = await registered('Fourth')
    expect(await fourth.raw('/claim', { platform: 'linux/amd64', capacity: { slots: 1 }, ...building }).then((response) => response.json())).toMatchObject({ order: 'prepare', step: 'custom:convert:2' })
    expect(await fourth.raw('/claim', { platform: 'linux/amd64', capacity: { slots: 1 }, ...building, images: [{ step: 'custom:convert:2' }] }).then((response) => response.json())).toEqual({ order: 'none' })
  })

  it('serves the install script to anyone, for this app, and gives the one command with each registration token', async () => {
    const script = await admin.request('/api/runners/install.sh')
    expect([script.status, script.headers.get('content-type')]).toEqual([200, 'text/x-shellscript; charset=utf-8'])
    const text = await script.text()
    expect(text).toMatch(/^#!\/bin\/sh\n/)
    expect(text).toContain("url='http://localhost'")
    const runner = await created('ada', '/workflow_runners', { name: 'Installed' })
    const issued = (await (await as('ada', `/api/workflows/runners/${String(runner.id)}/registration`, { method: 'POST' })).json()) as { token: string; command: string }
    expect(issued.command).toBe(`curl -fsSL http://localhost/api/runners/install.sh | sh -s -- --token ${issued.token}`)
  })

  it("carries a basePath that moves the system endpoints through the install command, its script and the runner's calls", async () => {
    const options = workflows(join(folder.dir, 'storage'))
    const { resources, views } = configExports(workflowsModule(options))
    vi.stubEnv('PROTOBASE_ENCRYPTION_KEY', Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64'))
    const backend = createAdmin({
      resources, views, db, workflows: options,
      files: { providers: { private: localFiles({ dir: join(folder.dir, 'private') }) }, secret: 'files-secret-for-the-runner-tests' },
      authenticate: () => ({ user: { id: 'ada', roles: ['keeper'] }, tenant: '1' }),
      options: { statementTimeoutMs, roles, basePath: '/backend/v1' },
    })
    vi.unstubAllEnvs()
    const post = (path: string, body?: unknown) => backend.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    const runner = (await (await post('/backend/v1/workflow_runners', { name: 'Elsewhere' })).json()) as { id: string }
    const issued = (await (await post(`/backend/workflows/runners/${runner.id}/registration`)).json()) as { token: string; command: string; endpoint: string }
    expect(issued.command).toBe(`curl -fsSL http://localhost/backend/runners/install.sh | sh -s -- --token ${issued.token}`)
    expect(issued.endpoint).toBe('http://localhost/backend/runners/v1')
    const script = await (await backend.request('/backend/runners/install.sh')).text()
    expect(script).toContain("api_path='/backend'")
    expect((await backend.request('/api/runners/install.sh')).status).toBe(404)
    // The runner's own client, with the path the script passes to register
    const urls: string[] = []
    const fetch = async (url: string, init: RequestInit) => (urls.push(new URL(url).pathname), backend.request(url, init))
    const registered = await appClient({ url: 'http://localhost', apiPath: '/backend', fetch }).register({ token: issued.token, platform: 'linux/amd64', kinds: ['container'] })
    const machine = appClient({ url: 'http://localhost', apiPath: '/backend', token: registered.token, fetch })
    expect(await machine.claim({ platform: 'linux/amd64', kinds: ['container'], labels: [], capacity: { slots: 1 }, images: [], instances: [] })).toEqual({ order: 'none' })
    expect(urls).toEqual(['/backend/runners/v1/register', '/backend/runners/v1/claim'])
  })
})

import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type AuditEvent, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'storage_configurations'>({
  author: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'storage_configurations.read'],
  keeper: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'storage_configurations.*'],
})
// Ada keeps the configurations, Bob only uses them; Eve keeps those of another tenant.
const people: Record<string, { roles: string[]; tenant: string }> = { ada: { roles: ['keeper'], tenant: '1' }, bob: { roles: ['author'], tenant: '1' }, eve: { roles: ['keeper'], tenant: '2' } }
const accessKey = 'AKIDEXAMPLE0001'
const secretKey = 'wJalrXUtnFEMI-secret-example'

const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states } })

describe.skipIf(!(await postgresTemplateReady('jobs')))('storage configurations and the storage steps on the app\'s database and jobs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let receiver: Server
  let folder: Awaited<ReturnType<typeof tempDir>>
  const fetched: string[] = []
  const errors: unknown[] = []
  const events: AuditEvent[] = []

  const start = async () => {
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  }

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    // A local receiver is a private address, so the http step may reach it here, as in development.
    const workflows: WorkflowsOptions = {
      allowPrivateAddresses: true,
      savedByRoles: async ({ id }) => people[id]?.roles ?? [],
      storage: { root: join(folder.dir, 'storage'), endpoints: ['https://storage.example.com'] },
    }
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    const files = { providers: { private: localFiles({ dir: join(folder.dir, 'private') }) }, secret: 'files-secret-for-the-storage-tests' }
    vi.stubEnv('PROTOBASE_ENCRYPTION_KEY', Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64'))
    admin = createAdmin({
      resources, views, db, files, workflows,
      authenticate: (request) => {
        const person = people[request.headers.get('x-user')!]!
        return { user: { id: request.headers.get('x-user')!, roles: person.roles }, tenant: person.tenant }
      },
      options: { statementTimeoutMs, roles, audit: { publish: async (event) => void events.push(event) } },
    })
    vi.unstubAllEnvs()
    receiver = createServer((request, response) => {
      fetched.push(request.url ?? '')
      response.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4 report')
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    await start()
  })

  afterAll(async () => {
    await runtime?.stop()
    if (receiver) await new Promise((resolve) => receiver.close(resolve))
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(`/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const created = async (user: string, path: string, body: unknown) => {
    const response = await as(user, path, { method: 'POST', body })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const runRow = async (id: string) => (await sql<{ status: string; output: unknown; error: string | null; cause: string | null }>`select status, output, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const finished = (id: string) => vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(id)).status), { timeout: 20_000, interval: 50 })
  const stored = async (name: string) => (await sql<Record<string, unknown>>`select kind, dir, bucket, access_key_id, secret_access_key, tenant_id from workflows.storage_configurations where name = ${name} order by tenant_id`.execute(db)).rows

  it('lets only the grant create, change and delete a configuration, and never shows its keys again', async () => {
    expect([403, 404]).toContain((await as('bob', '/storage_configurations', { method: 'POST', body: { name: 'mine', kind: 'local', dir: 'mine' } })).status)
    const bucket = await as('ada', '/storage_configurations', { method: 'POST', body: { name: 'docs', kind: 's3', bucket: 'acme-docs', region: 'eu-west-1', endpoint: 'https://storage.example.com', access_key_id: accessKey, secret_access_key: secretKey } })
    expect(bucket.status).toBe(201)
    const created = await bucket.text()
    const id = JSON.parse(created).id as string
    const reads = [created, await (await as('ada', `/storage_configurations/${id}`)).text(), await (await as('ada', '/storage_configurations')).text(), await (await as('bob', `/storage_configurations/${id}`)).text()]
    for (const text of reads) {
      expect(text).not.toContain(accessKey)
      expect(text).not.toContain(secretKey)
    }
    expect((await as('ada', `/storage_configurations/${id}?fields=secret_access_key`)).status).toBe(400)
    expect((await as('ada', `/storage_configurations/${id}:reveal`, { method: 'POST', body: { field: 'secret_access_key' } })).status).not.toBe(200)
    // The database holds them sealed.
    const [row] = await stored('docs')
    expect(JSON.stringify(row)).not.toContain(secretKey)
    expect(row!.secret_access_key).toEqual(expect.stringMatching(/^pbenc:/))

    // Reading one is no grant to change or delete it.
    expect([403, 404]).toContain((await as('bob', `/storage_configurations/${id}`, { method: 'PATCH', body: { bucket: 'elsewhere' } })).status)
    expect([403, 404]).toContain((await as('bob', `/storage_configurations/${id}`, { method: 'DELETE' })).status)
    expect(await stored('docs')).toEqual([row])
  })

  it('refuses a local folder that leaves the root, a bucket without an endpoint and region, an endpoint the app does not list or that is private, and a name taken in the tenant', async () => {
    const refused = async (body: Record<string, unknown>) => {
      const response = await as('ada', '/storage_configurations', { method: 'POST', body })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
    await refused({ name: 'escape', kind: 'local', dir: '../private' })
    await refused({ name: 'hidden', kind: 'local', dir: '.tmp' })
    await refused({ name: 'unlisted', kind: 's3', bucket: 'acme-docs', region: 'eu-west-1', endpoint: 'https://other.example.com' })
    await refused({ name: 'unplaced', kind: 's3', bucket: 'acme-docs', region: 'eu-west-1' })
    await refused({ name: 'unregioned', kind: 's3', bucket: 'acme-docs', endpoint: 'https://storage.example.com' })
    for (const endpoint of ['https://127.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://10.0.0.1']) await refused({ name: 'private', kind: 's3', bucket: 'acme-docs', region: 'eu-west-1', endpoint })
    expect(await stored('escape')).toEqual([])
    await created('ada', '/storage_configurations', { name: 'twice', kind: 'local', dir: 'twice' })
    expect((await as('ada', '/storage_configurations', { method: 'POST', body: { name: 'twice', kind: 'local', dir: 'other' } })).status).toBeGreaterThanOrEqual(400)
  })

  it("keeps each tenant's configurations its own, under the same name", async () => {
    const ours = await created('ada', '/storage_configurations', { name: 'shared', kind: 'local', dir: 'tenant-1' })
    await created('eve', '/storage_configurations', { name: 'shared', kind: 'local', dir: 'tenant-2' })
    expect((await as('eve', `/storage_configurations/${ours}`)).status).toBe(404)
    expect((await as('eve', `/storage_configurations/${ours}`, { method: 'PATCH', body: { dir: 'taken' } })).status).toBe(404)
    expect((await as('eve', `/storage_configurations/${ours}`, { method: 'DELETE' })).status).toBe(404)
    expect((await stored('shared')).map((row) => [row.tenant_id, row.dir])).toEqual([['1', 'tenant-1'], ['2', 'tenant-2']])
  })

  it('stores an answer through a configuration switched from S3 to a local folder, unchanged, resumes after a restart without fetching it again, and catches a file that is gone', async () => {
    const config = await created('ada', '/storage_configurations', { name: 'reports', kind: 's3', bucket: 'acme-reports', region: 'eu-west-1', endpoint: 'https://storage.example.com', access_key_id: accessKey, secret_access_key: secretKey })
    const base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    const workflow = await created('bob', '/workflows', {
      name: 'Keep the report',
      definition: definition({
        Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: `${base}/files/report.pdf`, store: { configuration: 'reports', path: 'in/report.pdf' } }, Assign: { stored: '{% $states.result.body %}' }, Next: 'Hold' },
        Hold: { Type: 'Wait', Seconds: 2, Next: 'Read' },
        Read: { Type: 'Task', Resource: 'app:storage.get', Arguments: { file: '{% $stored %}' }, Assign: { size: '{% $states.result.size %}' }, Next: 'Missing' },
        Missing: {
          Type: 'Task',
          Resource: 'app:storage.get',
          Arguments: { file: { configuration: 'reports', path: 'gone.pdf', name: 'gone.pdf', type: 'application/pdf', size: 1 } },
          Catch: [{ ErrorEquals: ['Storage.NotFound'], Assign: { gone: '{% $states.errorOutput.Error %}' }, Next: 'Done' }],
          Next: 'Done',
        },
        Done: { Type: 'Succeed', Output: '{% {"stored": $stored, "size": $size, "gone": $gone} %}' },
      }),
    })
    // Switched to a local folder after the workflow was saved: the workflow names the configuration, never where it points.
    expect((await as('ada', `/storage_configurations/${config}`, { method: 'PATCH', body: { kind: 'local', dir: 'reports', bucket: null, region: null, endpoint: null, access_key_id: null, secret_access_key: null } })).status).toBe(200)

    const before = fetched.length
    const runId = await created('bob', '/workflow_runs', { workflow_id: workflow, input: {} })
    await vi.waitFor(async () => expect((await runRow(runId)).status).toBe('waiting'), { timeout: 10_000, interval: 50 })
    await runtime!.stop()
    await start()
    await finished(runId)

    expect(await runRow(runId)).toMatchObject({
      status: 'succeeded',
      output: { stored: { configuration: 'reports', node: expect.any(String), path: 'in/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 15 }, size: 15, gone: 'Storage.NotFound' },
    })
    expect(fetched.length - before).toBe(1)
    expect(await readFile(join(folder.dir, 'storage', 'reports', 'in', 'report.pdf'), 'utf8')).toBe('%PDF-1.4 report')
    // A local configuration opens no keys.
    expect(events.filter((event) => event.type === 'field.revealed')).toEqual([])
  })
})

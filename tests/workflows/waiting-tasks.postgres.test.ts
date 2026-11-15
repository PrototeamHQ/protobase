import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
// Where runs keep their traces.
const trace = await traceFiles()

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import type { Plugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'
import { definitionFields } from '../../test-support/workflow-fields'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({ builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'] })

// An approver outside the app: the step hands it the question and the token, and it answers later.
const asked: { question: string; token: string }[] = []
const plugin: Plugin = {
  name: 'acme',
  label: 'Acme',
  steps: { ask: { label: 'Ask', description: 'Asks someone outside.', input: { type: 'object' }, run: async ({ input }) => void asked.push(input as { question: string; token: string }) } },
}

const approval = (task: Record<string, unknown> = {}) => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Ask',
    States: {
      Ask: {
        Type: 'Task',
        Resource: 'acme:ask.waitForTaskToken',
        Arguments: { question: '{% $states.context.Execution.Input.question %}', token: '{% $states.context.Task.Token %}' },
        TimeoutSeconds: 3600,
        HeartbeatSeconds: 600,
        Assign: { answer: '{% $states.result %}' },
        Catch: [{ ErrorEquals: ['Approval.Refused'], Assign: { answer: '{% { "refused": $states.errorOutput.Cause } %}' }, Next: 'Done' }],
        Next: 'Done',
        ...task,
      },
      Done: { Type: 'Succeed', Output: '{% $answer %}' },
    },
  },
})

describe.skipIf(!(await postgresTemplateReady('jobs')))("waiting Tasks on the app's database", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  const errors: unknown[] = []

  beforeAll(async () => {
    const workflows: WorkflowsOptions = { savedByRoles: async () => ['builder'], plugins: [{ plugin, source: 'acme' }] }
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    admin = createAdmin({ resources, views, db, files: trace.files, authenticate: () => ({ user: { id: 'ada', roles: ['builder'] }, tenant: '1' }), workflows, options: { statementTimeoutMs, roles } })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const create = async (path: string, body: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const status = async (id: string) => (await sql<{ status: string; output: unknown; error: string | null; cause: string | null }>`select status, output, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const ended = async (id: string) => {
    await vi.waitFor(async () => expect((await status(id)).status).toMatch(/succeeded|failed/), { timeout: 20_000, interval: 50 })
    return status(id)
  }
  // Starts a run and waits until it handed its question off and parked.
  const handedOff = async (definition: object, question: string) => {
    const workflow = await create('/workflows', { name: question, ...definitionFields(definition) })
    const id = await create('/workflow_runs', { workflow_id: workflow, input: { question } })
    await vi.waitFor(async () => {
      expect(asked.some((one) => one.question === question)).toBe(true)
      expect((await status(id)).status).toBe('waiting')
    }, { timeout: 20_000, interval: 50 })
    return { id, token: asked.find((one) => one.question === question)!.token }
  }
  // An outside call, with no session: the token is all it brings.
  const send = (call: string, body: unknown) => admin.request(`/api/workflows/tasks/${call}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('parks the run after one hand-off, takes a heartbeat, and goes on with the result sent back', async () => {
    const { id, token } = await handedOff(approval(), 'Ship 1.0?')
    const [row] = (await sql<{ token_hash: string; handed_off_at: Date | null; status: string }>`select token_hash, handed_off_at, status from workflows.task_tokens where run_id = ${id}`.execute(db)).rows
    // Only the token's digest is kept, and nothing the run keeps holds the token.
    expect(row).toMatchObject({ token_hash: createHash('sha256').update(token).digest('hex'), handed_off_at: expect.any(Date), status: 'waiting' })
    expect((await send('heartbeat', { taskToken: token })).status).toBe(200)
    const answered = await send('success', { taskToken: token, output: JSON.stringify({ approved: true, by: 'ops' }) })
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({})
    expect(await ended(id)).toMatchObject({ status: 'succeeded', output: { approved: true, by: 'ops' } })
    expect(asked.filter((one) => one.question === 'Ship 1.0?')).toHaveLength(1)
    const steps = await trace.steps(db, id)
    expect(steps.find((step) => step.state === 'Ask')).toMatchObject({ status: 'succeeded', input: { question: 'Ship 1.0?', token: '[redacted]' }, output: { approved: true, by: 'ops' } })
    const kept = JSON.stringify({ steps, rows: (await sql`select * from workflows.task_tokens where run_id = ${id}`.execute(db)).rows, run: await status(id) })
    expect(kept).not.toContain(token)
    // The try is over: a second answer is refused as Step Functions refuses one to a closed task.
    const again = await send('success', { taskToken: token, output: '{}' })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ title: 'TaskTimedOut' })
  })

  it('fails with the error an outside failure names, which a catcher takes', async () => {
    const { id, token } = await handedOff(approval(), 'Ship on Friday?')
    expect((await send('failure', { taskToken: token, error: 'Approval.Refused', cause: 'Not on a Friday' })).status).toBe(200)
    expect(await ended(id)).toMatchObject({ status: 'succeeded', output: { refused: 'Not on a Friday' } })
  })

  it('fails with States.HeartbeatTimeout once no heartbeat came in time, waking for it on its own', async () => {
    const { id, token } = await handedOff(approval({ TimeoutSeconds: 30, HeartbeatSeconds: 1 }), 'Still there?')
    expect(await ended(id)).toMatchObject({ status: 'failed', error: 'States.HeartbeatTimeout', cause: 'No heartbeat came within 1 seconds' })
    expect((await send('success', { taskToken: token, output: '{}' })).status).toBe(409)
  })

  it('refuses what is no token, a token no Task was given, and a body that is no answer', async () => {
    const invalid = await send('success', { taskToken: 'nope', output: '{}' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ title: 'InvalidToken' })
    const unknown = await send('heartbeat', { taskToken: 'A'.repeat(43) })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ title: 'TaskDoesNotExist' })
    // Step Functions' shape exactly: output is a string of JSON.
    expect((await send('success', { taskToken: 'A'.repeat(43) })).status).toBe(400)
    expect((await send('success', { taskToken: 'A'.repeat(43), output: { approved: true } })).status).toBe(400)
    const notJson = await send('success', { taskToken: 'A'.repeat(43), output: 'approved' })
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toMatchObject({ title: 'InvalidOutput' })
    expect((await send('resume', { taskToken: 'A'.repeat(43) })).status).toBe(404)
  })
})

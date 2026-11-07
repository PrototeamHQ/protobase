import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { workflowResources } from '@protobase/schema/internal'
import { StepError, type Definition } from '@protobase/workflows'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { fakeWorkflowEngine } from '../../testing/fake-workflow-engine'

const meta = { title: 'Plugins/Field types/Workflow run', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const parts = workflowResources('workflows')
const resources = [parts.workflows, parts.workflowVersions, parts.workflowRuns].map((part) => part.toModel())
const views = [parts.workflowsView, parts.workflowVersionsView, parts.workflowRunsView].map((part) => part.toModel())

// The secret the fetch sends, which no page may show
const token = 'tok-5ecret-4a7c91'

/** Fetches the open tickets with the secret, then stores them as records of `resource`, which fails unless it is `tickets`. */
const syncTickets = (resource: string): Definition => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: {
        Type: 'Task',
        Resource: 'app:http',
        Arguments: { url: 'https://tickets.example.com/open', headers: { Authorization: "{% 'Bearer ' & $states.context.Secrets.TICKETS_TOKEN %}" } },
        Assign: { tickets: '{% $states.result.body.items %}' },
        Next: 'Store',
      },
      Store: { Type: 'Task', Resource: 'app:records.create', Arguments: { resource, data: '{% $tickets %}' }, End: true },
    },
  },
})

/** Waits for the gate the story opens, then echoes the run's input. */
const gated: Definition = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Ask',
    States: { Ask: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $states.context.Execution.Input.url %}' }, End: true } },
  },
}

/** Reads today's open tickets, then mails a summary composed from them. */
const mailSummary: Definition = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://tickets.example.com/open' }, Assign: { count: '{% $count($states.result.body.items) %}' }, Next: 'Compose' },
      Compose: { Type: 'Pass', Assign: { text: '{% $string($count) & " open tickets" %}' }, Next: 'Mail' },
      Mail: { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: 'team@example.com', subject: 'Open tickets', text: '{% $text %}' }, End: true },
    },
  },
}

const workflow = (id: number, name: string, definition: Definition) => ({ id, name, description: null, definition, version: 1 })
const version = (id: number, definition: Definition) => ({ workflow_id: id, version: 1, definition, saved_by: 'u-ada', saved_at: '2026-11-04T09:00:00Z' })

// What the stories' steps did, for the checks to read, and the gate the gated step waits on
const calls = { fetch: 0, store: 0, mail: 0 }
let openGate = () => {}

const Workspace = ({ start, runs = [] }: { start: string; runs?: Record<string, unknown>[] }) => {
  const [api] = useState(() => {
    calls.fetch = 0
    calls.store = 0
    calls.mail = 0
    const gate = new Promise<void>((resolve) => (openGate = resolve))
    const engine = fakeWorkflowEngine({
      tables: () => api.rows,
      secrets: { TICKETS_TOKEN: token },
      tasks: {
        // A GET reads, as the built-in step says, so a replay sends it again.
        'app:http': Object.assign(
          async (args: unknown, { log }: { log: (message: string) => void }) => {
            const { url, headers } = args as { url: string; headers?: { Authorization: string } }
            if (url.includes('gate')) await gate
            calls.fetch++
            log(`GET ${url} as ${headers?.Authorization ?? 'nobody'}`)
            return { status: 200, headers: {}, body: { items: [{ title: 'Printer jam' }] } }
          },
          { writes: () => false },
        ),
        'app:mail.send': async () => {
          calls.mail++
          return { message_id: `<m-${calls.mail}@example.com>` }
        },
        'app:records.create': async (args, { log }) => {
          const { resource } = args as { resource: string }
          calls.store++
          if (resource !== 'tickets') throw new StepError('Records.Refused', `There is no resource "${resource}"`)
          log('Created 1 ticket')
          return [{ id: 1, title: 'Printer jam' }]
        },
      },
    })
    const rows = {
      workflows: [workflow(1, 'Sync tickets', syncTickets('tikets')), workflow(2, 'Ask and wait', gated), workflow(3, 'Mail the summary', mailSummary)],
      workflow_versions: [version(1, syncTickets('tikets')), version(2, gated), version(3, mailSummary)],
      workflow_runs: [],
    }
    // As the resources' access says: runs are created, never changed, and versions only read
    const readOnly = { read: true, create: false, update: false, delete: false, conditional: [] }
    const permissions = { workflow_runs: { ...readOnly, create: true }, workflow_versions: readOnly }
    const api = fakeApi({ resources, views, rows, permissions, beforeWrite: engine.beforeWrite, afterWrite: engine.afterWrite, workflowRunTrace: engine.trace })
    for (const run of runs) void api.client.create('workflow_runs', run)
    return api
  })
  const [session] = useState(() => createStaticSession('story-token', { id: 'u-ada', email: 'ada@example.com', name: 'Ada Lovelace', role: 'admin' }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Acme" />
    </div>
  )
}

const nodeOf = (canvasElement: HTMLElement, path: string) =>
  waitFor(() => {
    const node = canvasElement.querySelector<HTMLElement>(`.react-flow__node[data-id="state:${path}"]`)
    if (!node) throw new Error(`No node ${path} yet`)
    return node
  })

const markOf = async (canvasElement: HTMLElement, path: string, mark: string) => {
  const node = await nodeOf(canvasElement, path)
  await waitFor(() => expect(within(node).getByText(mark)).toBeInTheDocument(), { timeout: 10_000 })
  return node
}

const panel = (canvasElement: HTMLElement) => within(within(canvasElement).getByRole('region', { name: 'Chosen step' }))

/** A run whose second step failed, as its page opens: the failed step chosen with its error, input and logs. */
export const FailedRun: StoryObj = { name: 'A failed run', render: () => <Workspace start="/workflow_runs/run-1" runs={[{ workflow_id: 1, input: { team: 'support' } }]} /> }

/**
 * The failed run shows its failed step with its error and logs and the first step's output, the secret blanked out; the
 * step is fixed in the editor, and the re-run from the failed step succeeds without running the first step again.
 */
export const FailsFixedAndRerunChecks: StoryObj = {
  ...FailedRun,
  name: 'Fails, is fixed and re-runs from the failed step (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await markOf(canvasElement, 'Store', 'Failed')
    await markOf(canvasElement, 'Fetch', 'Succeeded')
    // The page opens on the step that failed
    await waitFor(() => expect(panel(canvasElement).getByText('Records.Refused')).toBeVisible())
    expect(panel(canvasElement).getByText(/There is no resource "tikets"/)).toBeVisible()
    expect(calls).toEqual({ fetch: 1, store: 1, mail: 0 })

    // The first step's output and logs, with the secret blanked out of its input and logs
    await userEvent.click(await nodeOf(canvasElement, 'Fetch'))
    await waitFor(() => expect(panel(canvasElement).getByText(/"status": 200/)).toBeVisible())
    expect(panel(canvasElement).getByText(/GET https:\/\/tickets\.example\.com\/open as Bearer \[redacted\]/)).toBeVisible()
    expect(panel(canvasElement).getByText(/"Authorization": "\[redacted\]"/)).toBeVisible()
    expect(canvasElement.textContent).not.toContain(token)

    // Fixed in the editor
    await userEvent.click(canvas.getAllByRole('link', { name: 'Sync tickets' })[0]!)
    await userEvent.click(await nodeOf(canvasElement, 'Store'))
    const resource = await within(await canvas.findByRole('region', { name: 'Chosen step' })).findByRole('textbox', { name: /^Resource/ })
    await userEvent.clear(resource)
    await userEvent.type(resource, 'tickets')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled())

    // Re-run from the failed step
    await userEvent.click(await waitFor(() => canvasElement.querySelector<HTMLElement>('main a[href="/workflow_runs/run-1"]') ?? Promise.reject(new Error('No link to the run yet'))))
    await userEvent.click(await canvas.findByRole('link', { name: 'Re-run from the failed step' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Create/ }))
    await markOf(canvasElement, 'Store', 'Succeeded')
    expect(calls).toEqual({ fetch: 1, store: 2, mail: 0 })
    // The re-run went on after the fetch, which its trace does not hold
    await userEvent.click(await nodeOf(canvasElement, 'Fetch'))
    await waitFor(() => expect(panel(canvasElement).getByText('This step did not run in this run.')).toBeVisible())
  },
}

/** A workflow whose step waits until the story lets it go on. */
export const GatedWorkflow: StoryObj = { name: 'A workflow to test-run', render: () => <Workspace start="/workflows/2" /> }

/** A test run started from the workflow's page with a sample input, its step followed live until it ends. */
export const TestRunChecks: StoryObj = {
  ...GatedWorkflow,
  name: 'A test run is followed live (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'Test run' }))
    const input = await canvas.findByRole('textbox', { name: /^Input/ })
    await userEvent.click(input)
    await userEvent.paste('{"url": "https://gate.example.com/ask"}')
    await userEvent.click(canvas.getByRole('button', { name: /^Create/ }))
    await markOf(canvasElement, 'Ask', 'Running')
    openGate()
    await markOf(canvasElement, 'Ask', 'Succeeded')
    expect(calls.fetch).toBe(1)
  },
}

/** A run that mailed a summary. */
export const MailedRun: StoryObj = { name: 'A run that sent a mail', render: () => <Workspace start="/workflow_runs/run-1" runs={[{ workflow_id: 3, input: {} }]} /> }

/** The run is replayed from its page: the read runs again and the summary is composed, but the mail is not sent. */
export const ReplayChecks: StoryObj = {
  ...MailedRun,
  name: 'A replay sends no mail (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await markOf(canvasElement, 'Mail', 'Succeeded')
    expect(calls).toEqual({ fetch: 1, store: 0, mail: 1 })
    await userEvent.click(await canvas.findByRole('link', { name: 'Replay' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Create/ }))
    await waitFor(() => expect(calls.fetch).toBe(2), { timeout: 10_000 })
    await markOf(canvasElement, 'Mail', 'Succeeded')
    expect(calls).toEqual({ fetch: 2, store: 0, mail: 1 })
    await userEvent.click(await nodeOf(canvasElement, 'Mail'))
    await waitFor(() => expect(panel(canvasElement).getAllByText('Not sent: replay')).toHaveLength(2))
    expect(panel(canvasElement).getByText(/"text": "1 open tickets"/)).toBeVisible()
    expect(panel(canvasElement).getByText(/<m-1@example\.com>/)).toBeVisible()
  },
}

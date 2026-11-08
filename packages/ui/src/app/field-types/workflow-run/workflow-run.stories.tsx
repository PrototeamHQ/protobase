import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { appPath } from '@protobase/schema'
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

/** Reads today's open tickets with the secret, then mails a summary composed from them. */
const mailSummary: Definition = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: {
        Type: 'Task',
        Resource: 'app:http',
        Arguments: { url: 'https://tickets.example.com/open', headers: { Authorization: "{% 'Bearer ' & $states.context.Secrets.TICKETS_TOKEN %}" } },
        Assign: { count: '{% $count($states.result.body.items) %}' },
        Next: 'Compose',
      },
      Compose: { Type: 'Pass', Assign: { text: '{% $string($count) & " open tickets" %}' }, Next: 'Mail' },
      Mail: { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: 'team@example.com', subject: 'Open tickets', text: '{% $text %}' }, End: true },
    },
  },
}

/** Mails the team that it syncs, then stores the tickets as records of `resource`, which fails unless it is `tickets`. */
const mailThenStore = (resource: string): Definition => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Mail',
    States: {
      Mail: { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: 'team@example.com', subject: 'Syncing tickets', text: 'The open tickets are synced now' }, Next: 'Store' },
      Store: { Type: 'Task', Resource: 'app:records.create', Arguments: { resource, data: [{ title: 'Printer jam' }] }, End: true },
    },
  },
})

/** Greets, keeping the trace its `trace` setting says. */
const greet = (trace: Definition['trace']): Definition => ({
  trigger: { manual: {} },
  trace,
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Greet', States: { Greet: { Type: 'Pass', Output: { greeting: 'Hello' }, End: true } } },
})

// The page of the stories' first run, which each run story opens
const runPage = appPath({ kind: 'record', resource: 'workflow_runs', key: 'run-1' })

const workflow = (id: number, name: string, definition: Definition) => ({ id, name, description: null, definition, version: 1 })
const version = (id: number, definition: Definition) => ({ workflow_id: id, version: 1, definition, saved_by: 'u-ada', saved_at: '2026-11-04T09:00:00Z' })

// What the stories' steps did, for the checks to read, and the gate the gated step waits on
const calls = { fetch: 0, store: 0, mail: 0 }
let openGate = () => {}
// The secret whose change a read's next call logs in the step cache's words. The stories' engine has no step cache, so
// this only lets the replay check see that the page shows that line; replay.postgres.test.ts proves the cache logs it.
let secretChanged: string | undefined

/**
 * `traceOnceEnded` serves a run's trace only once the run has ended, as a trace whose last part is kept just before
 * the run is marked ended: the page reads it when the run ends.
 */
const Workspace = ({ start, runs = [], traceOnceEnded = false }: { start: string; runs?: Record<string, unknown>[]; traceOnceEnded?: boolean }) => {
  const [api] = useState(() => {
    calls.fetch = 0
    calls.store = 0
    calls.mail = 0
    secretChanged = undefined
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
            if (secretChanged) log(`The secret ${secretChanged} changed since that result was kept`)
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
      workflows: [
        workflow(1, 'Sync tickets', syncTickets('tikets')),
        workflow(2, 'Ask and wait', gated),
        workflow(3, 'Mail the summary', mailSummary),
        workflow(4, 'Mail, then store', mailThenStore('tikets')),
        workflow(5, 'Greet, keeping no trace', greet('none')),
        workflow(6, 'Greet, keeping failing runs only', greet('failed')),
      ],
      workflow_versions: [version(1, syncTickets('tikets')), version(2, gated), version(3, mailSummary), version(4, mailThenStore('tikets')), version(5, greet('none')), version(6, greet('failed'))],
      workflow_runs: [],
    }
    // As the resources' access says: runs are created, never changed, and versions only read
    const readOnly = { read: true, create: false, update: false, delete: false, conditional: [] }
    const permissions = { workflow_runs: { ...readOnly, create: true }, workflow_versions: readOnly }
    const ended = (id: string) => ['succeeded', 'failed'].includes(String(api.rows.workflow_runs!.find((run) => run.id === id)?.status))
    const workflowRunTrace = async (id: string) => (!traceOnceEnded || ended(id) ? engine.trace(id) : { steps: [] })
    const api = fakeApi({ resources, views, rows, permissions, beforeWrite: engine.beforeWrite, afterWrite: engine.afterWrite, workflowRunTrace })
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

// The side panel, which shows the chosen step or the run
const sidePanel = (canvasElement: HTMLElement) => within(within(canvasElement).getByRole('complementary'))

/**
 * From a failed run's page: fixes the Store step's resource to `tickets` beside the run, then saves and re-runs from
 * that step, as its panel offers, until Store succeeds.
 */
const fixAndRerun = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(await nodeOf(canvasElement, 'Store'))
  await userEvent.click(await sidePanel(canvasElement).findByRole('button', { name: 'Settings' }))
  const resource = await sidePanel(canvasElement).findByRole('textbox', { name: /^Resource/ })
  await userEvent.clear(resource)
  await userEvent.type(resource, 'tickets')
  const rerun = await sidePanel(canvasElement).findByRole('button', { name: 'Save and re-run from this step' })
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'))
  await userEvent.click(rerun)
  await canvas.findByRole('heading', { name: 'Re-run from Store?' })
  await userEvent.click(sidePanel(canvasElement).getByRole('button', { name: 'Save and re-run' }))
  await markOf(canvasElement, 'Store', 'Succeeded')
}

/** A run whose second step failed, as its page opens: the failed step chosen with its error, input and logs. */
export const FailedRun: StoryObj = { name: 'A failed run', render: () => <Workspace start={runPage} runs={[{ workflow_id: 1, input: { team: 'support' } }]} /> }

/**
 * The failed run opens on its failed step, with its error and logs and the first step's output, the secret blanked out.
 * The step is fixed beside the run, without leaving it, and Save and re-run from this step succeeds without running the
 * first step again; an older version shows read-only, with the way back.
 */
export const FailsFixedAndRerunChecks: StoryObj = {
  ...FailedRun,
  name: 'Fails, is fixed and re-runs from the failed step (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const side = () => within(canvas.getByRole('complementary'))
    await markOf(canvasElement, 'Store', 'Failed')
    await markOf(canvasElement, 'Fetch', 'Succeeded')
    // The page opens on the step that failed, its data first
    await waitFor(() => expect(side().getByText('Records.Refused')).toBeVisible())
    expect(side().getByText(/There is no resource "tikets"/)).toBeVisible()
    expect(calls).toEqual({ fetch: 1, store: 1, mail: 0 })

    // The first step's output and logs, with the secret blanked out of its input and logs
    await userEvent.click(await nodeOf(canvasElement, 'Fetch'))
    await waitFor(() => expect(side().getByText(/"status": 200/)).toBeVisible())
    expect(side().getByText(/GET https:\/\/tickets\.example\.com\/open as Bearer \[redacted\]/)).toBeVisible()
    expect(side().getByText(/"Authorization": "\[redacted\]"/)).toBeVisible()
    expect(canvasElement.textContent).not.toContain(token)
    expect(await canvas.findByText(/failed at Store, version 1/)).toBeVisible()

    // Fixed under the run: its marks stay, and the step changed says so
    await userEvent.click(await nodeOf(canvasElement, 'Store'))
    await userEvent.click(await side().findByRole('button', { name: 'Settings' }))
    const resource = await side().findByRole('textbox', { name: /^Resource/ })
    await userEvent.clear(resource)
    await userEvent.type(resource, 'tickets')
    await markOf(canvasElement, 'Store', 'Changed')
    expect(await canvas.findByText(/Your changes are not in this run/)).toBeVisible()

    // Save and re-run, asked in the panel, which says what stays and what acts again
    const rerun = await side().findByRole('button', { name: 'Save and re-run from this step' })
    await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'))
    await userEvent.click(rerun)
    await canvas.findByRole('heading', { name: 'Re-run from Store?' })
    expect(side().getByText(/Keeps 1 step as it ran. Runs on version 2 with the same input./)).toBeVisible()
    expect(side().getByText('These steps act again: Store (Create records).')).toBeVisible()
    await userEvent.click(side().getByRole('button', { name: 'Save and re-run' }))
    await markOf(canvasElement, 'Store', 'Succeeded')
    expect(calls).toEqual({ fetch: 1, store: 2, mail: 0 })
    // The step before it stays as it ran, which the re-run's trace holds
    await markOf(canvasElement, 'Fetch', 'Succeeded')

    // The run's data starts a new test run
    await userEvent.click(await nodeOf(canvasElement, 'Fetch'))
    await waitFor(() => expect(side().getByText(/"status": 200/)).toBeVisible())
    await userEvent.click(side().getAllByRole('button', { name: 'Use as test input' })[0]!)
    await canvas.findByRole('heading', { name: 'Test run' })
    expect(side().getByText(/From the output of Fetch/)).toBeVisible()
    await userEvent.click(side().getByRole('button', { name: 'Close' }))

    // The run before the fix, from the Runs panel, shows on the version it ran on, read-only, with the way back
    await userEvent.click(canvas.getByRole('button', { name: 'Runs' }))
    await userEvent.click(await canvas.findByRole('link', { name: /^Failed .* version 1/ }))
    await waitFor(() => expect(canvas.getByRole('combobox', { name: 'Version' })).toHaveValue('1'))
    expect(await canvas.findByText(/on version 1, read-only. The latest is version 2./)).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Add step' })).toBeNull()
    expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.click(canvas.getByRole('link', { name: 'Edit latest version' }))
    expect(await canvas.findByRole('button', { name: 'Add step' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('link', { name: 'Hide run' }))
    await waitFor(() => expect(canvas.queryByText(/Run of/)).toBeNull())
  },
}

/**
 * A value of the run is inserted into the failed step's field: the earlier step gets a variable for it, which Undo takes
 * back with the insert. A later edit ends the offer, so Undo never takes that edit back with it.
 */
export const InsertValueChecks: StoryObj = {
  ...FailedRun,
  name: 'A value of the run is inserted into a field, and taken back (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await markOf(canvasElement, 'Store', 'Failed')
    const insert = async () => {
      await userEvent.click(await sidePanel(canvasElement).findByRole('button', { name: /^Insert value into Resource/ }))
      const fetch = await sidePanel(canvasElement).findByRole('group', { name: 'Fetch' })
      await userEvent.click(within(fetch).getByRole('option', { name: /^status/ }))
    }
    await userEvent.click(await sidePanel(canvasElement).findByRole('button', { name: 'Settings' }))
    await insert()
    const resource = await sidePanel(canvasElement).findByRole('textbox', { name: /^Resource/ })
    await waitFor(() => expect(resource).toHaveValue("{% 'tikets' & $fetch.status %}"))
    expect(sidePanel(canvasElement).getByText(/Added variable fetch to Fetch\. In this run: 200/)).toBeVisible()
    await userEvent.click(sidePanel(canvasElement).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(sidePanel(canvasElement).getByRole('textbox', { name: /^Resource/ })).toHaveValue('tikets'))
    expect(sidePanel(canvasElement).queryByText(/Added variable/)).toBeNull()

    await insert()
    expect(await sidePanel(canvasElement).findByText(/Added variable fetch to Fetch/)).toBeVisible()
    await userEvent.type(sidePanel(canvasElement).getByRole('textbox', { name: /^Resource/ }), ' ')
    await waitFor(() => expect(sidePanel(canvasElement).queryByRole('button', { name: 'Undo' })).toBeNull())
    expect(canvas.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  },
}

/** A run that mailed the team, then failed to store the tickets. */
export const MailedThenFailedRun: StoryObj = { name: 'A run that sent a mail, then failed', render: () => <Workspace start={runPage} runs={[{ workflow_id: 4, input: {} }]} /> }

/** The run is fixed and re-run from the failed step: the mail sent before it stays as it ran and is not sent again. */
export const RerunSendsNoMailAgainChecks: StoryObj = {
  ...MailedThenFailedRun,
  name: 'A re-run from the failed step sends no mail again (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    await markOf(canvasElement, 'Store', 'Failed')
    await markOf(canvasElement, 'Mail', 'Succeeded')
    expect(calls).toEqual({ fetch: 0, store: 1, mail: 1 })
    await fixAndRerun(canvasElement)
    expect(calls).toEqual({ fetch: 0, store: 2, mail: 1 })
  },
}

/** A passed run of a workflow that keeps no trace. */
export const UntracedRun: StoryObj = { name: 'A run that kept no trace', render: () => <Workspace start={runPage} runs={[{ workflow_id: 5, input: {} }]} /> }

// The run's status in the side panel, and the words that it kept no trace, with no step marked
const checkNoTrace = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const details = within(await canvas.findByRole('complementary', { name: 'The run' }))
  await waitFor(() => expect(details.getByText('Succeeded')).toBeVisible(), { timeout: 10_000 })
  expect(await canvas.findByText('This run kept no trace of its steps, as its trace setting says.')).toBeVisible()
  expect(within(await nodeOf(canvasElement, 'Greet')).queryByText('Succeeded')).toBeNull()
}

/** A run whose workflow keeps no trace shows its status and says it kept none. */
export const UntracedRunChecks: StoryObj = { ...UntracedRun, name: 'A run that kept no trace says so (checks)', tags: ['play', '!dev'], play: ({ canvasElement }) => checkNoTrace(canvasElement) }

/** A passed run of a workflow that keeps failing runs only, whose trace is dropped as the run passes. */
export const PassedFailingOnlyRunChecks: StoryObj = {
  name: 'A passed run of a workflow keeping failing runs only says it kept no trace (checks)',
  tags: ['play', '!dev'],
  render: () => <Workspace start={runPage} runs={[{ workflow_id: 6, input: {} }]} />,
  play: ({ canvasElement }) => checkNoTrace(canvasElement),
}

/** A workflow whose step waits until the story lets it go on. */
export const GatedWorkflow: StoryObj = { name: 'A workflow to test-run', render: () => <Workspace start={appPath({ kind: 'record', resource: 'workflows', key: '2' })} /> }

/** A test run started from the workflow's page with a sample input, its step followed live until it ends. */
export const TestRunChecks: StoryObj = {
  ...GatedWorkflow,
  name: 'A test run is followed live (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Test run' }))
    const input = await canvas.findByRole('textbox', { name: /^Input/ })
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('{"url": oops')
    expect(await canvas.findByText(/This is not valid JSON/)).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Start run' })).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('{"url": "https://gate.example.com/ask"}')
    await userEvent.click(canvas.getByRole('button', { name: 'Start run' }))
    await markOf(canvasElement, 'Ask', 'Running')
    openGate()
    await markOf(canvasElement, 'Ask', 'Succeeded')
    expect(calls.fetch).toBe(1)
  },
}

/** A run in progress opened by its own address: its step is marked running, then succeeded, without a reload. */
export const RunningRunChecks: StoryObj = {
  name: 'A run opened by its address while it goes on is followed live (checks)',
  tags: ['play', '!dev'],
  render: () => <Workspace start={runPage} runs={[{ workflow_id: 2, input: { url: 'https://gate.example.com/ask' } }]} />,
  play: async ({ canvasElement }) => {
    await markOf(canvasElement, 'Ask', 'Running')
    openGate()
    await markOf(canvasElement, 'Ask', 'Succeeded')
    await userEvent.click(await nodeOf(canvasElement, 'Ask'))
    await waitFor(() => expect(sidePanel(canvasElement).getByText(/GET https:\/\/gate\.example\.com\/ask as nobody/)).toBeVisible())
    // The step's try, when it started and how long it took
    const card = sidePanel(canvasElement).getByRole('article', { name: 'Try 1' })
    expect(within(card).getByText(/^\d[\d,.]* ms$/)).toBeVisible()
    expect(card.querySelector('header time')).toHaveAttribute('datetime', expect.stringMatching(/^\d{4}-\d\d-\d\dT/))
  },
}

/** A test run whose trace is served only once it ended: the page reads it then and marks the step. */
export const TraceAtEndChecks: StoryObj = {
  name: 'A run seen ended shows its whole trace (checks)',
  tags: ['play', '!dev'],
  render: () => <Workspace start={appPath({ kind: 'record', resource: 'workflows', key: '2' })} traceOnceEnded />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Test run' }))
    const input = await canvas.findByRole('textbox', { name: /^Input/ })
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('{"url": "https://gate.example.com/ask"}')
    await userEvent.click(canvas.getByRole('button', { name: 'Start run' }))
    // The page follows the run while it goes on, reading its trace empty, before the run is let go on
    const details = within(await canvas.findByRole('complementary', { name: 'The run' }))
    await waitFor(() => expect(details.getByText('Running')).toBeVisible(), { timeout: 10_000 })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    openGate()
    await markOf(canvasElement, 'Ask', 'Succeeded')
  },
}

/** A run that mailed a summary. */
export const MailedRun: StoryObj = { name: 'A run that sent a mail', render: () => <Workspace start={runPage} runs={[{ workflow_id: 3, input: {} }]} /> }

/**
 * The run is replayed from its page: the read runs again and the summary is composed, but the mail is not sent. The
 * page also shows the read's line that a secret changed since its result was kept; the read logs that line itself, so
 * this checks only that the page shows it.
 */
export const ReplayChecks: StoryObj = {
  ...MailedRun,
  name: 'A replay sends no mail (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await markOf(canvasElement, 'Mail', 'Succeeded')
    expect(calls).toEqual({ fetch: 1, store: 0, mail: 1 })
    // The read logs the step cache's line that the secret it sends changed
    secretChanged = 'TICKETS_TOKEN'
    await userEvent.click(await canvas.findByRole('button', { name: 'Replay without writing' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Replay' }))
    await waitFor(() => expect(calls.fetch).toBe(2), { timeout: 10_000 })
    await markOf(canvasElement, 'Mail', 'Succeeded')
    expect(calls).toEqual({ fetch: 2, store: 0, mail: 1 })
    await userEvent.click(await nodeOf(canvasElement, 'Mail'))
    const side = within(await canvas.findByRole('complementary', { name: 'Mail' }))
    await waitFor(() => expect(side.getAllByText('Not sent: replay')).toHaveLength(2))
    expect(side.getByText(/"text": "1 open tickets"/)).toBeVisible()
    expect(side.getByText(/<m-1@example\.com>/)).toBeVisible()
    await userEvent.click(await nodeOf(canvasElement, 'Fetch'))
    const read = within(await canvas.findByRole('complementary', { name: 'Fetch' }))
    await waitFor(() => expect(read.getByText(/The secret TICKETS_TOKEN changed since that result was kept/)).toBeVisible())
  },
}

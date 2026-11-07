import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { workflowResources } from '@protobase/schema/internal'
import { problemText, type Definition } from '@protobase/workflows'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { exampleWorkflowTypes } from '../../../../../../test-support/workflow-types'
import { definitionProblems } from './problems'

const meta = { title: 'Plugins/Field types/Workflow', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const parts = workflowResources('workflows')
const resources = [parts.workflows, parts.workflowVersions, parts.workflowRuns, parts.workflowSteps].map((part) => part.toModel())
const views = [parts.workflowsView, parts.workflowVersionsView, parts.workflowRunsView, parts.workflowStepsView].map((part) => part.toModel())

const fetchOnly: Definition = {
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://tickets.example.com/open' }, End: true } } },
}

const rows = {
  workflows: [
    { id: 1, name: 'Open tickets', description: null, definition: ticketsWorkflow, version: 1 },
    { id: 2, name: 'Fetch tickets', description: null, definition: fetchOnly, version: 1 },
  ],
  workflow_versions: [],
  workflow_runs: [],
  workflow_steps: [],
}

// The workflow a save stored, for the checks to read
let stored: Record<string, unknown> | undefined

// A save is checked as the server checks it, and refused as it is: a 400 naming each problem on the definition.
const checkSave = (resource: string, row: Record<string, unknown>) => {
  if (resource !== 'workflows') return
  const problems = definitionProblems(row.definition as Definition, exampleWorkflowTypes)
  if (problems.length === 0) return
  const detail = `The workflow cannot be saved: ${problems.map(problemText).join('; ')}`
  const errors = problems.map((problem) => ({ code: 'invalid-workflow', field: 'definition', message: problemText(problem), params: { state: problem.state, field: problem.field } }))
  throw new ApiError({ type: 'urn:protobase:problem:invalid-workflow', title: 'Bad Request', status: 400, detail, errors })
}

const Workspace = ({ start }: { start: string }) => {
  const [api] = useState(() => {
    stored = undefined
    return fakeApi({ resources, views, rows, beforeWrite: checkSave, afterWrite: (resource, row) => void (resource === 'workflows' && (stored = structuredClone(row))) })
  })
  const [session] = useState(() => createStaticSession('story-token', { id: 'u-ada', email: 'ada@example.com', name: 'Ada Lovelace', role: 'admin' }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Acme" />
    </div>
  )
}

const nodeOf = (canvasElement: HTMLElement, path: string) => waitFor(() => {
  const node = canvasElement.querySelector<HTMLElement>(`.react-flow__node[data-id="state:${path}"]`)
  if (!node) throw new Error(`No node ${path} yet`)
  return node
})

// The canvas laid out: no node waits at the top left with another any more
const laidOut = (canvasElement: HTMLElement, count: number) =>
  waitFor(
    () => {
      const nodes = [...canvasElement.querySelectorAll<HTMLElement>('.react-flow__node')]
      expect(nodes).toHaveLength(count)
      const corners = new Set(nodes.map((node) => node.style.transform))
      expect(corners.size).toBe(count)
      return nodes
    },
    { timeout: 10_000 },
  )

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

export const NewWorkflow: StoryObj = { name: 'A new workflow', render: () => <Workspace start="/workflows/new" /> }

export const MadeThroughTheApi: StoryObj = { name: 'A workflow made through the API', render: () => <Workspace start="/workflows/1" /> }

/** The create form adds three steps, connects them, one by its form and one on the canvas, and saves what it shows. */
export const CreatesAndConnectsChecks: StoryObj = {
  ...NewWorkflow,
  name: 'Creates and connects three steps (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByRole('textbox', { name: /^Name/ }), 'Daily digest')
    const add = async (option: string) => userEvent.selectOptions(await canvas.findByRole('combobox', { name: 'Add a step' }), option)
    await add('HTTP request')
    const panel = () => within(canvas.getByRole('region', { name: 'Chosen step' }))
    await userEvent.type(await panel().findByRole('textbox', { name: /^URL/ }), 'https://news.example.com/today')
    await add('Send mail')
    await userEvent.type(await panel().findByRole('textbox', { name: /^To/ }), 'team@example.com')
    await userEvent.type(panel().getByRole('textbox', { name: /^Subject/ }), 'Today')
    await userEvent.type(panel().getByRole('textbox', { name: /^Text/ }), "{{% $states.context.Execution.Input.body %}")
    await add('Succeed')
    // Step 1 goes on to step 2 by its form
    await userEvent.click(await nodeOf(canvasElement, 'Step 1'))
    await userEvent.selectOptions(await panel().findByRole('combobox', { name: 'Goes on to' }), 'Step 2')
    // Step 2 goes on to step 3 by a tap on its handle, then on step 3's
    await laidOut(canvasElement, 4)
    await waitFor(() => expect(canvasElement.querySelectorAll('.react-flow__edge')).toHaveLength(2))
    await userEvent.click((await nodeOf(canvasElement, 'Step 2')).querySelector('[data-handleid="next"]')!)
    await userEvent.click((await nodeOf(canvasElement, 'Step 3')).querySelector('[data-handleid="in"]')!)
    await waitFor(() => expect(canvasElement.querySelectorAll('.react-flow__edge')).toHaveLength(3))
    await userEvent.click(canvas.getByRole('button', { name: 'Create workflow' }))
    await canvas.findByRole('heading', { name: 'Daily digest' })
    expect(stored?.definition).toEqual({
      trigger: { manual: {} },
      stateMachine: {
        QueryLanguage: 'JSONata',
        StartAt: 'Step 1',
        States: {
          'Step 1': { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://news.example.com/today' }, Next: 'Step 2' },
          'Step 2': { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: 'team@example.com', subject: 'Today', text: '{% $states.context.Execution.Input.body %}' }, Next: 'Step 3' },
          'Step 3': { Type: 'Succeed' },
        },
      },
    })
  },
}

/** A workflow made through the API opens laid out by ELK: no two nodes overlap but a Map and the states inside it. */
export const LaidOutChecks: StoryObj = {
  ...MadeThroughTheApi,
  name: 'Opens laid out (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const nodes = await laidOut(canvasElement, 8)
    const boxes = nodes.map((node) => ({ id: node.dataset.id!, rect: node.getBoundingClientRect() }))
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        const nested = b.id.startsWith(`${a.id}/`) || a.id.startsWith(`${b.id}/`)
        if (!nested) expect(overlaps(a.rect, b.rect), `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
    const canvas = within(canvasElement)
    const labels = () => [...canvasElement.querySelectorAll('.react-flow__edge-text')].map((label) => label.textContent)
    await waitFor(() => expect(labels()).toEqual(expect.arrayContaining(['On error: States.ALL', '{% $count($tickets) > 0 %}', 'Otherwise'])))
  },
}

/** A step without an argument its type needs shows the problem on its node and field, and the save is refused. */
export const MissingInputChecks: StoryObj = {
  name: 'Refuses a missing input (checks)',
  tags: ['play', '!dev'],
  render: () => <Workspace start="/workflows/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fetch = await nodeOf(canvasElement, 'Fetch')
    await userEvent.click(fetch)
    const panel = within(await canvas.findByRole('region', { name: 'Chosen step' }))
    await userEvent.clear(panel.getByRole('textbox', { name: /^URL/ }))
    await waitFor(() => expect(within(fetch).getByText('1 problem')).toBeInTheDocument())
    expect(panel.getByText('Arguments.url: is missing; app:http needs it')).toBeVisible()
    expect(panel.getByRole('textbox', { name: /^URL/ })).toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    expect(await canvas.findByText('State "Fetch", field "Arguments.url": is missing; app:http needs it')).toBeVisible()
    expect(stored).toBeUndefined()
  },
}

/**
 * The add-step menu and the trigger's form offer the app's own plugins' types beside the built-in ones, draw their
 * forms from each one's input schema and refuse a missing input; a type that signs in is offered once the app can make
 * its connection, and one whose connection it cannot make is not.
 */
export const PluginTypesChecks: StoryObj = {
  ...NewWorkflow,
  name: "Offers a plugin's trigger and step types (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = () => within(canvas.getByRole('region', { name: 'Chosen step' }))
    const add = await canvas.findByRole('combobox', { name: 'Add a step' })
    expect(within(add).getByRole('option', { name: 'HTTP request' })).toBeInTheDocument()
    expect(within(add).getByRole('option', { name: 'Mail labels' })).toBeInTheDocument()
    await userEvent.selectOptions(add, 'Shout')
    expect(await canvas.findByRole('group', { name: /, Shout$/ })).toBeInTheDocument()
    const text = await panel().findByRole('textbox', { name: /^Text/ })
    expect(panel().getByRole('textbox', { name: /^loud/ })).toBeInTheDocument()
    await waitFor(() => expect(text).toHaveAttribute('aria-invalid', 'true'))
    expect(panel().getByText('Arguments.text: is missing; acme:shout needs it')).toBeVisible()
    await userEvent.click(canvasElement.querySelector<HTMLElement>('.react-flow__node[data-id="trigger"]')!)
    const startsWhen = await panel().findByRole('combobox', { name: 'Starts a run' })
    expect(within(startsWhen).getAllByRole('option').map((option) => option.textContent)).toEqual(['Run by hand', 'Record ready', 'Schedule', 'Webhook', 'Invoice overdue'])
    await userEvent.selectOptions(startsWhen, 'Invoice overdue')
    const days = await panel().findByRole('textbox', { name: /^days/ })
    await waitFor(() => expect(days).toHaveAttribute('aria-invalid', 'true'))
    await userEvent.type(days, '3')
    await waitFor(() => expect(days).not.toHaveAttribute('aria-invalid', 'true'))
  },
}

/**
 * A step whose type advises against forcing its cache on shows the type's disclaimer, as text, before the switch turns
 * on; once on, its node carries the warning mark.
 */
export const CacheForcedChecks: StoryObj = {
  ...NewWorkflow,
  name: 'Marks a cache forced on against its step type (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(await canvas.findByRole('combobox', { name: 'Add a step' }), 'Exchange rates')
    const panel = within(await canvas.findByRole('region', { name: 'Chosen step' }))
    const cache = await panel.findByRole('switch', { name: 'Cache results' })
    expect(cache).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(cache)
    const dialog = within(await page.findByRole('dialog', { name: 'Force the cache on?' }))
    expect(dialog.getByText('Rates change by the minute. <script>window.injected = true</script>')).toBeVisible()
    expect((window as { injected?: boolean }).injected).toBeUndefined()
    await userEvent.click(dialog.getByRole('button', { name: 'Turn on anyway' }))
    await waitFor(() => expect(cache).toHaveAttribute('aria-checked', 'true'))
    expect(await canvas.findByRole('group', { name: /Exchange rates, Caching forced on against this step's advice$/ })).toBeInTheDocument()
    expect(canvas.getAllByTitle("Caching forced on against this step's advice")).toHaveLength(1)
    await userEvent.click(cache)
    await waitFor(() => expect(canvas.queryByTitle("Caching forced on against this step's advice")).toBeNull())
  },
}

/** Delete removes a chosen edge, and Remove step a step with the edges to it; the save stores the workflow without them. */
export const RemovesChecks: StoryObj = {
  ...MadeThroughTheApi,
  name: 'Removes an edge and a step (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await laidOut(canvasElement, 8)
    const otherwise = await waitFor(() => {
      const label = [...canvasElement.querySelectorAll('.react-flow__edge-text')].find((text) => text.textContent === 'Otherwise')
      if (!label) throw new Error('No Otherwise edge yet')
      return label.closest('.react-flow__edge')!
    })
    await userEvent.click(otherwise.querySelector('.react-flow__edge-interaction')!)
    await userEvent.keyboard('{Delete}')
    await waitFor(() => expect([...canvasElement.querySelectorAll('.react-flow__edge-text')].map((text) => text.textContent)).not.toContain('Otherwise'))
    await userEvent.click(await nodeOf(canvasElement, 'Failed'))
    await userEvent.click(await within(await canvas.findByRole('region', { name: 'Chosen step' })).findByRole('button', { name: 'Remove step' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored).toBeDefined())
    const states = (stored!.definition as Definition).stateMachine.States
    expect(Object.keys(states)).toEqual(['Fetch', 'Any', 'Each', 'Done'])
    expect(states.Any).toEqual({ Type: 'Choice', Choices: [{ Condition: '{% $count($tickets) > 0 %}', Next: 'Each' }] })
    expect(states.Fetch).not.toHaveProperty('Catch')
  },
}

/** On a phone the graph fits the page's width, which scrolls as a whole, and a tap chooses a step. */
export const PhoneChecks: StoryObj = {
  ...MadeThroughTheApi,
  name: 'On a phone (checks)',
  tags: ['play', '!dev', 'phone'],
  play: async ({ canvasElement }) => {
    await laidOut(canvasElement, 8)
    const flow = canvasElement.querySelector<HTMLElement>('.react-flow')!
    expect(flow.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await userEvent.click(await nodeOf(canvasElement, 'Any'))
    const panel = within(await within(canvasElement).findByRole('region', { name: 'Chosen step' }))
    expect(panel.getByRole('combobox', { name: 'Otherwise goes to' })).toHaveValue('Done')
  },
}

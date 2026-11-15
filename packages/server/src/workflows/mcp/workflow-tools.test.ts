import { f, resource } from '@protobase/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ApprovalAnswer } from '../../assistant/approval'
import type { ToolRecords } from '../../assistant/records'
import type { ReadableResources, ToolContext } from '../../assistant/tools'
import { badRequest, forbidden } from '../../problem'
import { workflowTypes } from '../workflow-types'
import { getWorkflowRunTool, workflowReadTools } from './workflow-read-tools'
import { createWorkflowTool, runWorkflowTool, updateWorkflowTool } from './workflow-write-tools'

const machine = (states: Record<string, unknown>) => ({ QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states })
const fetchUrl = (url: string) => ({ trigger: { manual: {} }, state_machine: machine({ Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url }, End: true } }) })
const saved = { record: { id: 'w1', name: 'Fetch', version: 1, execution_order: 'sequence', ...fetchUrl('https://a.example') }, etag: '"v1"' }
const readable = { models: [], views: [] } as unknown as ReadableResources
const validateWorkflowTool = workflowReadTools({ ...workflowTypes(), readTrace: async () => [] }).find((tool) => tool.name === 'validate_workflow')!

const contextWith = (records: Partial<ToolRecords>, answer: ApprovalAnswer = 'approved') => {
  const approve = vi.fn(async () => answer)
  const context = { session: { user: { id: 1, roles: ['builder'] } }, show: () => {}, approve, records: { get: async () => saved, ...records } as ToolRecords, resources: async () => readable } satisfies ToolContext
  return { context, approve }
}

const refusedSave = badRequest('invalid-workflow', 'The workflow cannot be saved: State "Fetch", field "Next": ...', { problems: [{ state: 'Fetch', field: 'Next', message: 'names "Gone", which is not a state here' }] })

describe('validate_workflow', () => {
  it('checks a definition with no steps as a save does, but for its want of steps', async () => {
    const { context } = contextWith({})
    const empty = { trigger: { manual: {} }, state_machine: { QueryLanguage: 'JSONata', StartAt: '', States: {} } }
    expect(JSON.parse(await validateWorkflowTool.run(empty, context))).toEqual({ valid: true })
    expect(JSON.parse(await validateWorkflowTool.run({ ...empty, trigger: { manual: {}, other: {} } }, context))).toMatchObject({ valid: false })
    expect(JSON.parse(await validateWorkflowTool.run({ execution_order: 'data', state_machine: { QueryLanguage: 'JSONata', States: {} } }, context))).toEqual({ valid: true })
  })

  it('names the state, the field and what was expected, and reads nothing for a whole definition', async () => {
    const get = vi.fn()
    const { context } = contextWith({ get })
    const state_machine = machine({ Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $nope %}' }, Next: 'Gone' } })
    expect(JSON.parse(await validateWorkflowTool.run({ state_machine }, context))).toEqual({
      valid: false,
      problems: [
        { state: 'Fetch', field: 'Next', message: 'names "Gone", which is not a state here' },
        { state: 'Fetch', field: 'Arguments.url', message: 'reads $nope, which no state that can run before it assigns' },
      ],
    })
    expect(JSON.parse(await validateWorkflowTool.run(fetchUrl('https://a.example'), context))).toEqual({ valid: true })
    expect(get).not.toHaveBeenCalled()
  })

  it('checks an edit of the saved definition, read as the caller', async () => {
    const { context } = contextWith({})
    const edit = { state_machine: { States: { Fetch: { Resource: 'app:nope' } } } }
    expect(JSON.parse(await validateWorkflowTool.run({ id: 'w1', edit }, context)).problems).toEqual([expect.objectContaining({ state: 'Fetch', field: 'Resource' })])
    // An edit comes alone, as update_workflow takes it
    expect(await validateWorkflowTool.run({ id: 'w1', edit: {}, execution_order: 'data' }, context)).toMatch(/^Pass either/)
    // A workflow keeps its state machine and order, which an edit cannot remove
    expect(JSON.parse(await validateWorkflowTool.run({ id: 'w1', edit: { execution_order: null } }, context))).toEqual({ valid: false, problems: [{ field: 'execution_order', message: 'cannot be removed: a workflow keeps one' }] })
    // An edit that removes the trigger is checked as update_workflow saves it, with none, not with a manual one
    expect(JSON.parse(await validateWorkflowTool.run({ id: 'w1', edit: { trigger: null } }, context))).toMatchObject({ valid: false })
    const refusing = contextWith({ get: () => Promise.reject(forbidden('forbidden', 'You may not read workflows')) })
    expect(JSON.parse(await validateWorkflowTool.run({ id: 'w1', edit }, refusing.context))).toEqual({ error: 'forbidden', message: 'You may not read workflows' })
  })

  it("checks a record trigger against the resources and fields the caller may read, so it names none hidden from them", async () => {
    const captured = (name: string) => resource(name).table(name).fields({ id: f.integer(), status: f.text().filterable(), salary: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud()).toModel()
    const app = { orders: captured('orders'), payroll: captured('payroll') }
    const tool = workflowReadTools({ ...workflowTypes([], (name) => app[name as keyof typeof app]), readTrace: async () => [] }).find((candidate) => candidate.name === 'validate_workflow')!
    const { salary: _salary, ...visible } = app.orders.fields
    const { context } = contextWith({})
    const caller = { ...context, resources: async () => ({ models: [{ ...app.orders, fields: visible }], views: [] }) as unknown as ReadableResources }
    const onRecord = (input: Record<string, unknown>) => ({ trigger: { 'app:record': input }, state_machine: machine({ Done: { Type: 'Succeed' } }) })
    const problems = async (input: Record<string, unknown>) => JSON.parse(await tool.run(onRecord(input), caller)).problems?.map((problem: { message: string }) => problem.message)
    expect(await problems({ resource: 'orders', key: ['status'] })).toBeUndefined()
    expect(await problems({ resource: 'payroll' })).toEqual(['"payroll" is not a resource of this app'])
    expect(await problems({ resource: 'payroll', key: ['salary'] })).toEqual(['"payroll" is not a resource of this app'])
    expect(await problems({ resource: 'orders', key: ['salary'] })).toEqual(['orders has no field "salary"'])
  })

  it('takes a state machine or an id with an edit, not both', async () => {
    const { context } = contextWith({})
    expect(await validateWorkflowTool.run({ state_machine: {}, id: 'w1', edit: {} }, context)).toMatch(/^Pass either/)
    expect(await validateWorkflowTool.run({ id: 'w1' }, context)).toMatch(/^Pass either/)
  })
})

describe('create_workflow', () => {
  it('creates the workflow once approved and returns its id, version and etag', async () => {
    const create = vi.fn(async () => saved)
    const { context, approve } = contextWith({ create })
    const result = await createWorkflowTool().run({ name: 'Fetch', ...fetchUrl('https://a.example') }, context)
    expect(approve).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith('workflows', { name: 'Fetch', ...fetchUrl('https://a.example') })
    expect(JSON.parse(result)).toEqual({ id: 'w1', version: 1, etag: '"v1"' })
  })

  it('returns the saved workflow when a field rule hides its definition from the caller', async () => {
    const { state_machine: _hidden, ...withoutDefinition } = saved.record
    const { context } = contextWith({ create: async () => ({ ...saved, record: withoutDefinition }) })
    expect(JSON.parse(await createWorkflowTool().run({ name: 'Fetch', ...fetchUrl('https://a.example') }, context))).toEqual({ id: 'w1', version: 1, etag: '"v1"' })
  })

  it('imports a JSONata state machine exported from Step Functions as it is, and refuses its service tasks by name', async () => {
    const { context } = contextWith({})
    const exported = { QueryLanguage: 'JSONata', StartAt: 'Call', States: { Call: { Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: { ApiEndpoint: 'https://a.example', Method: 'POST', RequestBody: { a: 1 } }, End: true } } }
    expect(JSON.parse(await validateWorkflowTool.run({ state_machine: exported }, context)).problems).toEqual([
      { state: 'Call', field: 'Resource', message: "is a Step Functions service (arn:aws:states:::http:invoke), which does not run here: write the step with one of this app's step types, such as app:http for an HTTP request" },
    ])
    const jsonPath = { StartAt: 'A', States: { A: { Type: 'Pass', ResultPath: '$.x', End: true } } }
    expect(JSON.parse(await validateWorkflowTool.run({ state_machine: jsonPath }, context)).problems).toEqual([
      { field: 'stateMachine.QueryLanguage', message: 'is missing, so the machine is JSONPath, the default of Step Functions; only JSONata machines run here: set "QueryLanguage": "JSONata" and write its states in JSONata' },
      { state: 'A', field: 'ResultPath', message: 'is JSONPath, which does not run here; write the state in JSONata, with Arguments, Output and Assign' },
    ])
  })

  it("gives back the save check's problems, and saves nothing unapproved", async () => {
    const { context } = contextWith({ create: () => Promise.reject(refusedSave) })
    expect(JSON.parse(await createWorkflowTool().run({ name: 'Fetch', ...fetchUrl('x') }, context))).toEqual({
      error: 'invalid-workflow',
      message: 'The workflow does not fit the language; nothing was saved. Fix each problem and try again.',
      problems: [{ state: 'Fetch', field: 'Next', message: 'names "Gone", which is not a state here' }],
    })
    const create = vi.fn()
    const rejected = contextWith({ create }, 'rejected')
    expect(await createWorkflowTool().run({ name: 'Fetch', ...fetchUrl('x') }, rejected.context)).toMatch(/did not approve/)
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses before asking where writes reach other resources only', async () => {
    const { context, approve } = contextWith({})
    expect(JSON.parse(await createWorkflowTool({ resources: ['tasks'] }).run({ name: 'Fetch', ...fetchUrl('x') }, context)).error).toBe('forbidden')
    expect(approve).not.toHaveBeenCalled()
  })
})

describe('update_workflow', () => {
  it('applies an edit to the saved definition and saves it with the etag it was read with', async () => {
    const update = vi.fn(async () => ({ record: { ...saved.record, version: 2 }, etag: '"v2"' }))
    const { context } = contextWith({ update })
    const result = await updateWorkflowTool().run({ id: 'w1', edit: { state_machine: { States: { Fetch: { Arguments: { url: 'https://b.example' } } } } } }, context)
    // Only what the edit names is sent, so a field the caller may read but not write is not sent back
    expect(update).toHaveBeenCalledWith('workflows', 'w1', { state_machine: fetchUrl('https://b.example').state_machine }, { etag: '"v1"' })
    expect(JSON.parse(result)).toEqual({ id: 'w1', version: 2, etag: '"v2"' })
  })

  it("clears the connections an edit sets to null, though the caller may not read them", async () => {
    const update = vi.fn(async () => ({ record: { ...saved.record, version: 2 }, etag: '"v2"' }))
    const { context } = contextWith({ update })
    await updateWorkflowTool().run({ id: 'w1', edit: { connections: null } }, context)
    expect(update).toHaveBeenCalledWith('workflows', 'w1', expect.objectContaining({ connections: null }), { etag: '"v1"' })
  })

  it('refuses to merge an edit into connections the caller may not read, which would drop what is saved there', async () => {
    const update = vi.fn()
    const { context } = contextWith({ update })
    const edit = { connections: { 'mail:oauth': 'c1' } }
    expect(await updateWorkflowTool().run({ id: 'w1', edit }, context)).toBe('connections cannot be edited, as you may not read what is saved there: write it whole, or remove it with null; nothing was saved.')
    expect(update).not.toHaveBeenCalled()
    expect(JSON.parse(await validateWorkflowTool.run({ id: 'w1', edit }, context))).toEqual({
      valid: false,
      problems: [{ field: 'connections', message: 'cannot be edited, as you may not read what is saved there: write it whole, or remove it with null' }],
    })
  })

  it('replaces the whole definition, or only the name, and takes either an edit or a definition', async () => {
    const update = vi.fn(async () => saved)
    const { context } = contextWith({ update })
    await updateWorkflowTool().run({ id: 'w1', ...fetchUrl('https://c.example') }, context)
    await updateWorkflowTool().run({ id: 'w1', name: 'Renamed' }, context)
    await updateWorkflowTool().run({ id: 'w1', execution_order: 'data' }, context)
    expect(update.mock.calls.map((call) => (call as unknown[]).slice(2))).toEqual([[fetchUrl('https://c.example'), {}], [{ name: 'Renamed' }, {}], [{ execution_order: 'data' }, {}]])
    expect(await updateWorkflowTool().run({ id: 'w1', edit: {}, ...fetchUrl('x') }, context)).toMatch(/^Pass/)
    expect(await updateWorkflowTool().run({ id: 'w1' }, context)).toMatch(/nothing was saved/)
  })

  it("gives back the save check's problems for an edit that breaks the definition", async () => {
    const { context } = contextWith({ update: () => Promise.reject(refusedSave) })
    expect(JSON.parse(await updateWorkflowTool().run({ id: 'w1', edit: { state_machine: { States: { Fetch: { End: null, Next: 'Gone' } } } } }, context)).problems).toHaveLength(1)
  })

  it('refuses an edit of a workflow the caller cannot read', async () => {
    const { context, approve } = contextWith({ get: () => Promise.reject(forbidden('forbidden', 'No')) })
    expect(JSON.parse(await updateWorkflowTool().run({ id: 'w1', edit: { stateMachine: {} } }, context)).error).toBe('not-found')
    expect(approve).not.toHaveBeenCalled()
  })
})

describe('run_workflow and get_workflow_run', () => {
  it('starts a run of the version saved last with its input once approved, unless it names a version', async () => {
    const create = vi.fn(async () => ({ record: { id: 'r1', status: 'queued' }, etag: '"v1"' }))
    const { context } = contextWith({ create })
    expect(JSON.parse(await runWorkflowTool().run({ id: 'w1', input: { order: 42 } }, context))).toEqual({ run_id: 'r1', status: 'queued' })
    expect(create).toHaveBeenCalledWith('workflow_runs', { workflow_id: 'w1', input: { order: 42 }, version: saved.record.version })
    await runWorkflowTool().run({ id: 'w1', version: 1 }, context)
    expect(create).toHaveBeenLastCalledWith('workflow_runs', { workflow_id: 'w1', input: {}, version: 1 })
  })

  it('re-runs a failed run without an input of its own', async () => {
    const create = vi.fn(async () => ({ record: { id: 'r2', status: 'queued' }, etag: '"v1"' }))
    const { context } = contextWith({ create })
    expect(JSON.parse(await runWorkflowTool().run({ id: 'w1', rerun_of: 'r1' }, context))).toEqual({ run_id: 'r2', status: 'queued' })
    expect(create).toHaveBeenCalledWith('workflow_runs', { workflow_id: 'w1', rerun_of: 'r1' })
    expect(await runWorkflowTool().run({ id: 'w1', rerun_of: 'r1', input: {} }, context)).toMatch(/without input/)
  })

  it('replays a run, which it names', async () => {
    const create = vi.fn(async () => ({ record: { id: 'r3', status: 'queued' }, etag: '"v1"' }))
    const { context } = contextWith({ create })
    expect(JSON.parse(await runWorkflowTool().run({ id: 'w1', rerun_of: 'r1', replay: true }, context))).toEqual({ run_id: 'r3', status: 'queued' })
    expect(create).toHaveBeenCalledWith('workflow_runs', { workflow_id: 'w1', rerun_of: 'r1', replay: true })
    expect(await runWorkflowTool().run({ id: 'w1', replay: true }, context)).toMatch(/pass the run as rerun_of/)
  })

  it("reads the run, then the steps of its trace in the order they ran, one state's when asked, a page at a time", async () => {
    const trace = [
      { state: 'Fetch', status: 'retrying', error: 'Http.Status', scope: '', seq: 0 },
      { state: 'Fetch', status: 'failed', error: 'Http.Status', scope: '', seq: 1 },
      { state: 'Other', status: 'succeeded', scope: '', seq: 2 },
    ]
    const readTrace = vi.fn(async () => trace)
    const { context } = contextWith({ get: async () => ({ record: { id: 'r1', status: 'failed' }, etag: '"r"' }) })
    const first = JSON.parse(await getWorkflowRunTool(readTrace).run({ run_id: 'r1', state: 'Fetch', page_size: 1 }, context))
    expect(first).toEqual({ run: { id: 'r1', status: 'failed' }, steps: [trace[0]], next_page_token: '1' })
    const second = JSON.parse(await getWorkflowRunTool(readTrace).run({ run_id: 'r1', state: 'Fetch', page_size: 1, page_token: '1' }, context))
    expect(second).toEqual({ run: { id: 'r1', status: 'failed' }, steps: [trace[1]], next_page_token: '' })
    expect(readTrace).toHaveBeenCalledWith('r1')
  })

  it('reads no trace of a run the caller may not read', async () => {
    const readTrace = vi.fn(async () => [])
    const { context } = contextWith({ get: () => Promise.reject(forbidden('forbidden', 'No')) })
    expect(JSON.parse(await getWorkflowRunTool(readTrace).run({ run_id: 'r1' }, context)).error).toBeDefined()
    expect(readTrace).not.toHaveBeenCalled()
  })

  it("reads no trace when a field rule hides the run's trace file, and never returns the file", async () => {
    const readTrace = vi.fn(async () => [])
    const hidden = contextWith({ get: () => Promise.reject(badRequest('invalid-parameter', 'Unknown fields: trace_file')) })
    expect(JSON.parse(await getWorkflowRunTool(readTrace).run({ run_id: 'r1' }, hidden.context)).error).toBeDefined()
    expect(readTrace).not.toHaveBeenCalled()
    const get = vi.fn(async () => ({ record: { id: 'r1', status: 'failed', trace_file: { id: 'f1' } }, etag: '"r"' }))
    const shown = contextWith({ get })
    expect(JSON.parse(await getWorkflowRunTool(readTrace).run({ run_id: 'r1' }, shown.context)).run).toEqual({ id: 'r1', status: 'failed' })
    expect(get).toHaveBeenCalledWith('workflow_runs', 'r1', { fields: expect.arrayContaining(['trace_file']) })
  })
})

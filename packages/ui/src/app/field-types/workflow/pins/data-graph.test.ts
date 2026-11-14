import { describe, expect, it } from 'vitest'
import type { Definition, PinSchemas } from '@protobase/workflows'
import { connectData, disconnectData, removePure, wireRefusal } from './data-edits'
import { dataGraph } from './data-graph'
import { breakId, breakIn, inHandle, makeId, makeOut, outHandle } from './pure-ids'

const contact = { type: 'object', title: 'Contact', properties: { id: { type: 'string' }, name: { type: 'string' }, visits: { type: 'integer' } } }
const schemas: PinSchemas = {
  inputs: {
    'app:http': { type: 'object', required: ['url'], properties: { url: { type: 'string' }, method: { enum: ['GET', 'POST'] }, headers: { type: 'object', title: 'Headers', additionalProperties: { type: 'string' } }, body_schema: { type: 'object' } } },
    'app:records.update': { type: 'object', required: ['resource', 'key', 'data'], properties: { resource: { type: 'string' }, key: { anyOf: [{ type: 'string' }, { type: 'number' }] }, data: { type: 'object', 'x-record-of': 'resource', 'x-record-use': 'write' } } },
  },
  outputs: {
    'app:http': { type: 'object', properties: { status: { type: 'integer' }, headers: { type: 'object', title: 'Headers' }, body: { title: 'Body', 'x-schema-of': 'body_schema' } } },
    'app:record': { type: 'object', properties: { resource: { type: 'string' }, key: {}, record: { 'x-record-of': 'resource' } } },
  },
  records: (resource) => (resource === 'contacts' ? contact : undefined),
}

const workflow = (fetch: Record<string, unknown> = {}, save: Record<string, unknown> = {}, assign = true): Definition => ({
  trigger: { 'app:record': { resource: 'contacts' } },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com', body_schema: { type: 'object', title: 'Answer', properties: { ip: { type: 'string' } } }, ...fetch }, ...(assign && { Assign: { fetch: '{% $states.result %}' } }), Next: 'Save' },
      Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', ...save }, End: true },
    },
  },
})

describe('the data graph', () => {
  it('gives each node its typed pins, and draws a read of an object\'s field through a Break of it', () => {
    const graph = dataGraph(workflow({}, { key: '{% $states.context.Execution.Input.record.id %}', data: { name: '{% $fetch.body.ip %}', visits: 3 } }), schemas)
    expect(graph.outputs.get('')!.map((pin) => pin.path)).toEqual([['resource'], ['key'], ['record']])
    expect(graph.outputs.get('Fetch')!.map((pin) => [pin.path, pin.type])).toEqual([[['status'], { kinds: ['integer'] }], [['headers'], { kinds: ['object'], title: 'Headers' }], [['body'], { kinds: ['object'], title: 'Answer' }]])
    expect(graph.inputs.get('Save')!.map((pin) => [pin.key, pin.state])).toEqual([['resource', 'literal'], ['key', 'wired'], ['data', 'made']])
    expect(graph.pure.map((node) => node.id)).toEqual([breakId('', ['record']), breakId('Fetch', ['body']), makeId('Save', 'data')])
    const make = graph.pure.find((node) => node.kind === 'make')!
    expect(make.kind === 'make' && make.inputs.map((pin) => [pin.key, pin.state, pin.value])).toEqual([['id', 'empty', undefined], ['name', 'wired', '{% $fetch.body.ip %}'], ['visits', 'literal', 3]])
    expect(graph.edges.map((edge) => `${edge.source}${edge.sourceHandle} > ${edge.target}${edge.targetHandle}`).sort()).toEqual([
      `${breakId('', ['record'])}${outHandle(['id'])} > Save${inHandle('key')}`,
      `${breakId('Fetch', ['body'])}${outHandle(['ip'])} > ${makeId('Save', 'data')}${inHandle('name')}`,
      `${makeId('Save', 'data')}${makeOut} > Save${inHandle('data')}`,
      `${outHandle(['body'])}`.replace(/^/, `Fetch`) + ` > ${breakId('Fetch', ['body'])}${breakIn}`,
      `${outHandle(['record'])}`.replace(/^/, '') + ` > ${breakId('', ['record'])}${breakIn}`,
    ].sort())
  })

  it('wires a pin by writing its read into the input, giving the step a variable to keep its result when it has none', () => {
    const plain = workflow({}, { key: '1' }, false)
    const graph = dataGraph(plain, schemas, [{ kind: 'break', source: 'Fetch', path: ['body'] }, { kind: 'make', target: 'Save', key: 'data' }])
    const wired = connectData(plain, graph, { node: breakId('Fetch', ['body']), handle: outHandle(['ip']) }, { node: makeId('Save', 'data'), handle: inHandle('name') })
    expect(wired.stateMachine.States.Fetch).toMatchObject({ Assign: { fetch: '{% $states.result %}' } })
    expect(wired.stateMachine.States.Save).toMatchObject({ Arguments: { data: { name: '{% $fetch.body.ip %}' } } })
    const keyed = connectData(wired, dataGraph(wired, schemas, [{ kind: 'break', source: '', path: ['record'] }]), { node: breakId('', ['record']), handle: outHandle(['id']) }, { node: 'Save', handle: inHandle('key') })
    expect(keyed.stateMachine.States.Save).toMatchObject({ Arguments: { key: '{% $states.context.Execution.Input.record.id %}' } })
  })

  it('refuses a wire from a later step, from a step that shapes its output, or of a type the input does not take', () => {
    const definition = workflow({}, {})
    const graph = dataGraph(definition, schemas, [{ kind: 'break', source: 'Fetch', path: ['body'] }])
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, { node: 'Save', handle: inHandle('resource') })).toEqual({ reason: 'type', source: { kinds: ['integer'] }, target: { kinds: ['string'] } })
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, { node: 'Save', handle: inHandle('key') })).toBeUndefined()
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, { node: 'Fetch', handle: inHandle('url') })).toEqual({ reason: 'notBefore', step: 'Fetch' })
    expect(wireRefusal(definition, graph, { node: breakId('Fetch', ['body']), handle: outHandle(['ip']) }, { node: 'Save', handle: inHandle('key') })).toBeUndefined()
    const shaped = structuredClone(definition)
    Object.assign(shaped.stateMachine.States.Fetch!, { Output: '{% $states.result.body %}' })
    expect(wireRefusal(shaped, dataGraph(shaped, schemas), { node: 'Fetch', handle: outHandle(['body']) }, { node: 'Save', handle: inHandle('key') })).toEqual({ reason: 'shapesOutput', step: 'Fetch' })
  })

  it('clears an input when its wire goes, and every read through a Break when the Break goes', () => {
    const definition = workflow({}, { key: '{% $fetch.body.ip %}', data: { name: '{% $fetch.body.ip %}' } })
    const graph = dataGraph(definition, schemas)
    const edge = graph.edges.find((each) => each.target === 'Save' && each.targetHandle === inHandle('key'))!
    expect(disconnectData(definition, graph, edge).stateMachine.States.Save).toEqual({ Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', data: { name: '{% $fetch.body.ip %}' } }, End: true })
    const broken = graph.pure.find((node) => node.id === breakId('Fetch', ['body']))!
    expect(removePure(definition, graph, broken).stateMachine.States.Save).toEqual({ Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', data: {} }, End: true })
  })
})

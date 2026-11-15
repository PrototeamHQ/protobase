import { describe, expect, it } from 'vitest'
import type { Definition, PinSchemas } from '@protobase/workflows'
import { connectData, disconnectData, removePure, wireRefusal } from './data-edits'
import { dataGraph, type BreakNode } from './data-graph'
import { breakOutputs } from './node-sizes'
import { definitionGraph } from '../definition-graph'
import { unwiredOrderEdges } from '../flow-elements'
import { conditionKey, statusKey } from './node-pins'
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
    'app:records.update': { 'x-record-of': 'resource', description: 'the updated record' },
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

  it('shows only the fields of a Break that something reads, all of them once opened or while nothing reads any', () => {
    const graph = dataGraph(workflow({}, { key: '{% $states.context.Execution.Input.record.id %}' }), schemas, [{ kind: 'break', source: 'Fetch', path: ['body'] }])
    const record = graph.pure.find((node) => node.id === breakId('', ['record'])) as BreakNode
    expect(record.outputs.map((pin) => pin.path[0])).toEqual(['id', 'name', 'visits'])
    expect(breakOutputs(record, graph.edges, false)).toEqual({ shown: [{ path: ['id'], type: { kinds: ['string'] } }], folded: 2, foldable: true })
    expect(breakOutputs(record, graph.edges, true)).toMatchObject({ folded: 0, foldable: true })
    expect(breakOutputs(record, graph.edges, true).shown).toHaveLength(3)
    // A Break nothing reads yet, such as one just made on the canvas, shows every field to pick from
    const body = graph.pure.find((node) => node.id === breakId('Fetch', ['body'])) as BreakNode
    expect(breakOutputs(body, graph.edges, false)).toEqual({ shown: body.outputs, folded: 0, foldable: false })
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

  it("marks a Make's fields its schema requires, and drops a Make made on the canvas once its input is read whole", () => {
    const required: PinSchemas = { ...schemas, records: (resource) => (resource === 'contacts' ? { ...contact, required: ['name'] } : undefined) }
    const make = { kind: 'make' as const, target: 'Save', key: 'data' }
    const made = dataGraph(workflow({}, { data: {} }), required, [make]).pure.find((pure) => pure.id === makeId('Save', 'data'))
    expect(made?.kind === 'make' && made.inputs.map((input) => [input.key, input.required])).toEqual([['id', false], ['name', true], ['visits', false]])
    expect(dataGraph(workflow({}, { data: '{% $fetch.body %}' }), schemas, [make]).pure.some((pure) => pure.id === makeId('Save', 'data'))).toBe(false)
  })

  it("refuses in data order a wire from a step inside a Map to a step outside it, whose status only the Map reads", () => {
    const definition = {
      trigger: { manual: {} },
      order: 'data',
      stateMachine: {
        QueryLanguage: 'JSONata',
        States: {
          Each: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { States: { Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' } } } } },
          Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts' } },
        },
      },
    } as unknown as Definition
    const graph = dataGraph(definition, schemas)
    expect(wireRefusal(definition, graph, { node: 'Each/Fetch', handle: outHandle([statusKey]) }, { node: 'Save', handle: inHandle(conditionKey) })).toEqual({ reason: 'otherScope', step: 'Fetch' })
  })

  it("refuses a wire into a Block's step from a step outside the Block, which its steps never read", () => {
    const definition = {
      trigger: { manual: {} },
      stateMachine: {
        QueryLanguage: 'JSONata',
        StartAt: 'Fetch',
        States: {
          Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}' }, Next: 'Keep' },
          Keep: { Type: 'Block', Processor: { StartAt: 'Call', States: { Call: { Type: 'Task', Resource: 'app:http', Arguments: {}, End: true } } }, Cache: { Ttl: '1 hour' }, End: true },
        },
      },
    } as unknown as Definition
    expect(wireRefusal(definition, dataGraph(definition, schemas), { node: 'Fetch', handle: outHandle(['status']) }, { node: 'Keep/Call', handle: inHandle('url') })).toEqual({ reason: 'otherScope', step: 'Fetch' })
  })

  it("keeps in data order a wire from a field of a step's whole result through its Break, once saved and read back", () => {
    // Save gives one record, its whole result; in data order its status pin is a pin of its own beside it
    const definition = {
      trigger: { manual: {} },
      order: 'data',
      stateMachine: {
        QueryLanguage: 'JSONata',
        States: {
          Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', key: '2' } },
          Tell: { Type: 'Task', Resource: 'app:http', Arguments: {} },
        },
      },
    } as unknown as Definition
    const broken = breakId('Save', [])
    const graph = dataGraph(definition, schemas, [{ kind: 'break', source: 'Save', path: [] }])
    const wired = connectData(definition, graph, { node: broken, handle: outHandle(['name']) }, { node: 'Tell', handle: inHandle('url') })
    expect(wired.stateMachine.States.Tell).toMatchObject({ Arguments: { url: '{% $save.name %}' } })
    // Read back with no Break of the canvas's own, as after a save and a reload
    const edges = dataGraph(wired, schemas).edges.map((edge) => `${edge.source}${edge.sourceHandle} > ${edge.target}${edge.targetHandle}`)
    expect(edges).toContain(`Save${outHandle([])} > ${broken}${breakIn}`)
    expect(edges).toContain(`${broken}${outHandle(['name'])} > Tell${inHandle('url')}`)
    expect(edges.filter((edge) => edge.startsWith(`Save${outHandle(['name'])}`))).toEqual([])
  })

  it('keeps in data order the line between two steps that no wire stands for', () => {
    const definition = {
      trigger: { manual: {} },
      order: 'data',
      stateMachine: {
        QueryLanguage: 'JSONata',
        States: {
          Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}', total: '{% 1 %}' } },
          Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', key: '{% $total %}' } },
          Tell: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $fetch.body.ip %}' } },
        },
      },
    } as unknown as Definition
    const kept = unwiredOrderEdges(definitionGraph(definition), dataGraph(definition, schemas))
    expect(kept.map((edge) => [edge.source, edge.target])).toEqual([['state:Fetch', 'state:Save']])
  })

  it('clears an input when its wire goes, and every read through a Break when the Break goes', () => {
    const definition = workflow({}, { key: '{% $fetch.body.ip %}', data: { name: '{% $fetch.body.ip %}' } })
    const graph = dataGraph(definition, schemas)
    const edge = graph.edges.find((each) => each.target === 'Save' && each.targetHandle === inHandle('key'))!
    expect(disconnectData(definition, graph, edge).stateMachine.States.Save).toEqual({ Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', data: { name: '{% $fetch.body.ip %}' } }, End: true })
    const broken = graph.pure.find((node) => node.id === breakId('Fetch', ['body']))!
    expect(removePure(definition, graph, broken).stateMachine.States.Save).toEqual({ Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', data: {} }, End: true })
  })

  it('wires each read inside an expression, through a Make for an object whose fields compute, as a wire only the expression removes', () => {
    const definition = workflow({}, { key: "{% $states.context.Execution.Input.record.id & '' %}", data: { name: '{% $fetch.body.ip & " at " & $fetch.status %}' } })
    const graph = dataGraph(definition, schemas)
    expect(graph.pure.map((node) => node.id)).toEqual([breakId('', ['record']), breakId('Fetch', ['body']), makeId('Save', 'data')])
    const expression = graph.edges.filter((edge) => edge.expression).map((edge) => `${edge.source}${edge.sourceHandle} > ${edge.target}${edge.targetHandle}`).sort()
    expect(expression).toEqual([
      `${breakId('', ['record'])}${outHandle(['id'])} > Save${inHandle('key')}`,
      `${breakId('Fetch', ['body'])}${outHandle(['ip'])} > ${makeId('Save', 'data')}${inHandle('name')}`,
      `Fetch${outHandle(['status'])} > ${makeId('Save', 'data')}${inHandle('name')}`,
    ].sort())
    const broken = graph.pure.find((node) => node.id === breakId('Fetch', ['body']))!
    expect(removePure(definition, graph, broken)).toEqual(definition)
    // Each expression names what it reads, which its pin shows as chips
    expect(graph.inputs.get('Save')!.find((pin) => pin.key === 'key')!.reads).toEqual(['input.record.id'])
    const make = graph.pure.find((node) => node.kind === 'make')!
    expect(make.kind === 'make' && make.inputs.find((pin) => pin.key === 'name')!.reads).toEqual(['fetch.body.ip', 'fetch.status'])
  })
})

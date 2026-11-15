import { describe, expect, it } from 'vitest'
import type { Definition, PinSchemas } from '@protobase/workflows'
import { layoutKey } from '../manual-layout'
import { connectData, disconnectData, removePure, wireRefusal } from './data-edits'
import { dataGraph, type SelectNode } from './data-graph'
import { inHandle, outHandle, selectId, selectInput, selectOut } from './pure-ids'
import { addSelect } from './select-edits'

const schemas: PinSchemas = {
  inputs: { 'app:http': { type: 'object', properties: { url: { type: 'string' } } } },
  outputs: { 'app:http': { type: 'object', properties: { status: { type: 'integer' }, ok: { type: 'boolean' } } } },
  records: () => undefined,
}

const chosen = "{% $states.context.Execution.Input.topic = 'sales' ? 'https://example.com/sales' : $states.context.Execution.Input.topic = 'support' ? 'https://example.com/help' : 'https://example.com' %}"

// Fetch, then Tell in data order, Tell's url given
const workflow = (url: unknown): Definition =>
  ({
    trigger: { manual: {} },
    order: 'data',
    stateMachine: {
      QueryLanguage: 'JSONata',
      States: {
        Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}' } },
        Tell: { Type: 'Task', Resource: 'app:http', Arguments: { url } },
      },
    },
  }) as unknown as Definition

const urlOf = (definition: Definition) => (definition.stateMachine.States.Tell as { Arguments: { url?: unknown } }).Arguments.url
const selectOf = (definition: Definition) => dataGraph(definition, schemas).pure.find((node): node is SelectNode => node.kind === 'select')

describe('the Select node', () => {
  it('opens a value chosen by another as a Select between what it looks at and the argument, which reads it whole', () => {
    const definition = workflow(chosen)
    const graph = dataGraph(definition, schemas)
    const select = selectOf(definition)!
    expect(select).toMatchObject({ id: selectId('Tell', 'url'), target: 'Tell', key: 'url', part: { cases: [{ when: 'sales' }, { when: 'support' }], otherwise: 'https://example.com' } })
    expect(graph.inputs.get('Tell')!.find((pin) => pin.key === 'url')).toMatchObject({ state: 'made' })
    const wires = graph.edges.map((edge) => `${edge.source} ${edge.sourceHandle} > ${edge.target} ${edge.targetHandle}`)
    expect(wires).toContain(`${select.id} ${selectOut} > Tell ${inHandle('url')}`)
    expect(wires.filter((wire) => wire.endsWith(`> ${select.id} ${inHandle(selectInput)}`))).toHaveLength(1)
    expect(layoutKey(select.id, select)).toBe('Tell.#select.url')
  })

  it('looks at what a wire gives it, a value of its own once the wire is cut, and goes with the argument when removed', () => {
    const definition = workflow(chosen)
    const graph = dataGraph(definition, schemas)
    const select = selectOf(definition)!
    const into = { node: select.id, handle: inHandle(selectInput) }
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, into)).toBeUndefined()
    expect(urlOf(connectData(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, into))).toBe(chosen.replaceAll('$states.context.Execution.Input.topic', '$fetch.status'))
    const wire = graph.edges.find((edge) => edge.target === select.id)!
    expect(urlOf(disconnectData(definition, graph, wire))).toBe(chosen.replaceAll('$states.context.Execution.Input.topic', "''"))
    expect(urlOf(removePure(definition, graph, select))).toBeUndefined()
  })

  it('is added for an argument of a value, giving what it held in its one case and otherwise', () => {
    const added = addSelect(workflow('https://example.com'), 'Tell', 'url')
    expect(urlOf(added)).toBe("{% '' = '' ? 'https://example.com' : 'https://example.com' %}")
    expect(selectOf(added)).toMatchObject({ part: { operand: { value: '' }, cases: [{ when: '', then: 'https://example.com' }], otherwise: 'https://example.com' } })
    // An argument holding a read or an expression keeps it
    expect(addSelect(workflow('{% $fetch.status %}'), 'Tell', 'url')).toEqual(workflow('{% $fetch.status %}'))
  })
})

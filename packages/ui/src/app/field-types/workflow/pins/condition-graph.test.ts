import { describe, expect, it } from 'vitest'
import type { Definition, PinSchemas } from '@protobase/workflows'
import { layoutKey } from '../manual-layout'
import { clearConditionSide, newPart, setConditionSide } from './condition-edits'
import { connectData, disconnectData, removePure, wireRefusal } from './data-edits'
import { dataGraph, type ConditionNode } from './data-graph'
import { conditionKey, statusKey } from './node-pins'
import { conditionId, conditionOut, inHandle, outHandle } from './pure-ids'

const schemas: PinSchemas = {
  inputs: { 'app:http': { type: 'object', properties: { url: { type: 'string' } } } },
  outputs: { 'app:http': { type: 'object', properties: { status: { type: 'integer' }, ok: { type: 'boolean' } } } },
  records: () => undefined,
}

const saved = "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}"

// Save, Fetch and Tell in data order, Tell under `condition`
const workflow = (condition?: string): Definition =>
  ({
    trigger: { manual: {} },
    order: 'data',
    stateMachine: {
      QueryLanguage: 'JSONata',
      States: {
        Save: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com/save' } },
        Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}' } },
        Tell: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com/tell' }, ...(condition !== undefined && { Condition: condition }) },
      },
    },
  }) as unknown as Definition

const conditionOf = (definition: Definition) => (definition.stateMachine.States.Tell as { Condition?: string }).Condition
const wires = (definition: Definition) => dataGraph(definition, schemas).edges.map((edge) => `${edge.source} ${edge.sourceHandle} > ${edge.target} ${edge.targetHandle}${edge.expression ? ' (read)' : ''}`)
const nodes = (definition: Definition) => dataGraph(definition, schemas).pure.filter((node): node is ConditionNode => node.kind === 'condition')
const status = (step: string) => ({ node: step, handle: outHandle([statusKey]) })

describe('condition nodes', () => {
  it("opens a step's status compared with Succeeded as the status pin, an Equals of Succeeded and the Only when pin", () => {
    const definition = workflow(saved)
    const [equals, ...others] = nodes(definition)
    expect(others).toEqual([])
    expect(equals).toMatchObject({ id: conditionId('Tell', []), target: 'Tell', at: [], part: { kind: 'compare', op: '=' } })
    expect(equals!.inputs.map((pin) => [pin.key, pin.state, pin.value])).toEqual([
      ['0', 'wired', '{% $states.context.Steps.Save.Status %}'],
      ['1', 'literal', 'SUCCEEDED'],
    ])
    expect(equals!.inputs[1]).toMatchObject({ options: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED', 'SKIPPED'], statuses: true })
    // The status pin is wired to the Equals as it is, through no Break of the status
    expect(wires(definition).filter((wire) => wire.includes('when:')).sort()).toEqual([`Save ${outHandle([statusKey])} > ${equals!.id} ${inHandle('0')}`, `${equals!.id} ${conditionOut} > Tell ${inHandle(conditionKey)}`].sort())
    expect(dataGraph(definition, schemas).pure.map((node) => node.kind)).toEqual(['condition'])
    expect(dataGraph(definition, schemas).inputs.get('Tell')![0]).toMatchObject({ key: conditionKey, state: 'made' })
  })

  it('saves an opened Condition back byte for byte, and as the nodes say once they change', () => {
    const definition = workflow(saved)
    const graph = dataGraph(definition, schemas)
    expect(conditionOf(connectData(definition, graph, status('Save'), { node: conditionId('Tell', []), handle: inHandle('0') }))).toBe(saved)
    expect(conditionOf(setConditionSide(definition, 'Tell', [1], { value: 'SUCCEEDED' }))).toBe(saved)
    expect(conditionOf(setConditionSide(definition, 'Tell', [1], { value: 'FAILED' }))).toBe("{% $states.context.Steps.Save.Status = 'FAILED' %}")
    expect(conditionOf(connectData(definition, graph, status('Fetch'), { node: conditionId('Tell', []), handle: inHandle('0') }))).toBe("{% $states.context.Steps.Fetch.Status = 'SUCCEEDED' %}")
  })

  it("makes a step's status dropped on another step's Only when pin an Equals of Succeeded between them", () => {
    const definition = workflow()
    const graph = dataGraph(definition, schemas)
    const onlyWhen = { node: 'Tell', handle: inHandle(conditionKey) }
    expect(wireRefusal(definition, graph, status('Save'), onlyWhen)).toBeUndefined()
    const wired = connectData(definition, graph, status('Save'), onlyWhen)
    expect(conditionOf(wired)).toBe(saved)
    expect(nodes(wired).map((node) => node.part.kind)).toEqual(['compare'])
    // A step's status on its own Only when pin would wait on itself
    expect(wireRefusal(definition, graph, status('Tell'), onlyWhen)).toEqual({ reason: 'notBefore', step: 'Tell' })
  })

  it('draws an And of a Comparison and a Not as a node each, with values of their own on the sides nothing is wired to', () => {
    const definition = workflow("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and $not($fetch.status > 399) %}")
    const drawn = nodes(definition)
    expect(drawn.map((node) => [node.id, node.part.kind])).toEqual([
      [conditionId('Tell', []), 'logic'],
      [conditionId('Tell', [0]), 'compare'],
      [conditionId('Tell', [1]), 'not'],
      [conditionId('Tell', [1, 0]), 'compare'],
    ])
    const greater = drawn.find((node) => node.id === conditionId('Tell', [1, 0]))!
    // A value compared with a whole number is a number
    expect(greater.inputs.map((pin) => [pin.state, pin.type])).toEqual([['wired', { kinds: ['integer'] }], ['literal', { kinds: ['integer'] }]])
    expect(wires(definition)).toEqual(
      expect.arrayContaining([
        `${conditionId('Tell', [])} ${conditionOut} > Tell ${inHandle(conditionKey)}`,
        `${conditionId('Tell', [0])} ${conditionOut} > ${conditionId('Tell', [])} ${inHandle('0')}`,
        `${conditionId('Tell', [1])} ${conditionOut} > ${conditionId('Tell', [])} ${inHandle('1')}`,
        `${conditionId('Tell', [1, 0])} ${conditionOut} > ${conditionId('Tell', [1])} ${inHandle('0')}`,
        `Fetch ${outHandle(['status'])} > ${conditionId('Tell', [1, 0])} ${inHandle('0')}`,
      ]),
    )
    expect(drawn.map((node) => layoutKey(node.id, node))).toEqual(['Tell.#when', 'Tell.#when.0', 'Tell.#when.1', 'Tell.#when.1.0'])
  })

  it('removes a node with what it takes, leaving its side what it holds with nothing wired, and the whole Condition with the last node', () => {
    const definition = workflow("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and $not($fetch.status > 399) %}")
    const graph = dataGraph(definition, schemas)
    const node = (at: number[]) => graph.pure.find((each) => each.id === conditionId('Tell', at))!
    expect(conditionOf(removePure(definition, graph, node([1])))).toBe("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and true %}")
    expect(conditionOf(removePure(definition, graph, node([1, 0])))).toBe("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and $not(false) %}")
    expect(conditionOf(removePure(definition, graph, node([])))).toBeUndefined()
    // Removed one after another from the graph drawn before either, a node and the one it is part of leave what the outer's removal leaves
    expect(conditionOf(removePure(removePure(definition, graph, node([1, 0])), graph, node([1])))).toBe("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and true %}")
    expect(conditionOf(removePure(removePure(definition, graph, node([1])), graph, node([1, 0])))).toBe("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and true %}")
    // A wire cut from a Comparison's side leaves it an empty value
    const read = graph.edges.find((edge) => edge.source === 'Fetch' && edge.target === conditionId('Tell', [1, 0]))!
    expect(conditionOf(disconnectData(definition, graph, read))).toBe("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and $not('' > 399) %}")
  })

  it("wires a value into a Comparison's side whatever its type, and only a yes or no into an And's", () => {
    const definition = workflow(`{% ${newPart('and').sides.map(() => 'true').join(' and ')} %}`)
    const graph = dataGraph(definition, schemas)
    const and = { node: conditionId('Tell', []), handle: inHandle('1') }
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['ok']) }, and)).toBeUndefined()
    expect(conditionOf(connectData(definition, graph, { node: 'Fetch', handle: outHandle(['ok']) }, and))).toBe('{% true and $fetch.ok %}')
    expect(wireRefusal(definition, graph, status('Save'), and)).toMatchObject({ reason: 'type' })
    expect(wireRefusal(definition, graph, { node: 'Fetch', handle: outHandle(['status']) }, and)).toMatchObject({ reason: 'type' })
    const compared = setConditionSide(definition, 'Tell', [1], newPart('<'))
    expect(conditionOf(compared)).toBe("{% true and '' < '' %}")
    const less = { node: conditionId('Tell', [1]), handle: inHandle('1') }
    expect(conditionOf(connectData(compared, dataGraph(compared, schemas), { node: 'Fetch', handle: outHandle(['status']) }, less))).toBe("{% true and '' < $fetch.status %}")
    expect(conditionOf(clearConditionSide(compared, 'Tell', [1]))).toBe('{% true and true %}')
  })

  it('draws any other Condition as one Expression node with a pin per value it reads, and leaves it as it is', () => {
    const condition = "{% $fetch.status >= 400 or $states.context.Steps.Save.Status = 'FAILED' %}"
    const definition = workflow(condition)
    const [expression, ...others] = nodes(definition)
    expect(others).toEqual([])
    expect(expression).toMatchObject({ id: conditionId('Tell', []), part: { kind: 'expression', source: " $fetch.status >= 400 or $states.context.Steps.Save.Status = 'FAILED' " } })
    expect(expression!.inputs.map((pin) => pin.key)).toEqual(['$fetch.status', '$states.context.Steps.Save.Status'])
    expect(wires(definition)).toEqual(
      expect.arrayContaining([
        `Fetch ${outHandle(['status'])} > ${expression!.id} ${inHandle('$fetch.status')} (read)`,
        `Save ${outHandle([statusKey])} > ${expression!.id} ${inHandle('$states.context.Steps.Save.Status')} (read)`,
        `${expression!.id} ${conditionOut} > Tell ${inHandle(conditionKey)}`,
      ]),
    )
    // Its pins take no wire, and nothing in it is changed by a side's edit
    expect(wireRefusal(definition, dataGraph(definition, schemas), status('Save'), { node: expression!.id, handle: inHandle('$fetch.status') })).toEqual({ reason: 'notPins' })
    expect(setConditionSide(definition, 'Tell', [0], { value: 1 })).toEqual(definition)
    // A Condition that reads a value no pin gives is an Expression too, so that read is not hidden
    expect(nodes(workflow('{% $unknown = 1 %}')).map((node) => [node.part.kind, node.inputs.length])).toEqual([['expression', 0]])
  })
})

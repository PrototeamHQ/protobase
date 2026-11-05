import { describe, expect, it } from 'vitest'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { definitionOf, emptyDefinition, triggerId } from './definition'
import { definitionGraph } from './definition-graph'

describe('definitionGraph', () => {
  it('draws the trigger, each state in order with a Map before the states inside it, and each edge with its field', () => {
    const graph = definitionGraph(ticketsWorkflow)
    expect(graph.nodes.map((node) => [node.id, node.kind === 'state' ? (node.parent ?? null) : null, node.kind === 'state' && node.first])).toEqual([
      [triggerId, null, false],
      ['Fetch', null, true],
      ['Any', null, false],
      ['Each', null, false],
      ['Each/Mail', 'Each', true],
      ['Each/Sent', 'Each', false],
      ['Done', null, false],
      ['Failed', null, false],
    ])
    expect(graph.edges.map(({ kind, source, target, field, label }) => ({ kind, source, target, field, label }))).toEqual([
      { kind: 'start', source: triggerId, target: 'Fetch', field: 'StartAt', label: undefined },
      { kind: 'next', source: 'Fetch', target: 'Any', field: 'Next', label: undefined },
      { kind: 'catch', source: 'Fetch', target: 'Failed', field: 'Catch[0].Next', label: 'States.ALL' },
      { kind: 'rule', source: 'Any', target: 'Each', field: 'Choices[0].Next', label: '{% $count($tickets) > 0 %}' },
      { kind: 'default', source: 'Any', target: 'Done', field: 'Default', label: undefined },
      { kind: 'next', source: 'Each', target: 'Done', field: 'Next', label: undefined },
      { kind: 'next', source: 'Each/Mail', target: 'Each/Sent', field: 'Next', label: undefined },
    ])
  })

  it('leaves out an edge to no state of its machine, which the check names on its state', () => {
    const broken = definitionOf({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Gone', States: { A: { Type: 'Pass', Next: 'Nowhere' } } } })
    expect(definitionGraph(broken).edges).toEqual([])
  })

  it('draws a workflow without a definition as its trigger alone', () => {
    expect(definitionOf(null)).toEqual(emptyDefinition())
    expect(definitionGraph(definitionOf(null))).toEqual({ nodes: [{ kind: 'trigger', id: triggerId, trigger: { manual: {} } }], edges: [] })
  })
})

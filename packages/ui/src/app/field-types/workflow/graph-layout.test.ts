import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { definitionGraph } from './definition-graph'
import { elkGraph, layoutGraph, type Box } from './graph-layout'
import type { Graph } from './definition-graph'

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('layoutGraph', () => {
  it('places every node, no two of the same machine overlapping, each Map around its own and edges going right', async () => {
    const graph = definitionGraph(ticketsWorkflow)
    const boxes = await layoutGraph(new ELK(), graph)
    expect([...boxes.keys()].sort()).toEqual(graph.nodes.map((node) => node.id).sort())
    const siblings = (parent: string | undefined) => graph.nodes.filter((node) => (node.kind === 'state' ? node.parent : undefined) === parent).map((node) => boxes.get(node.id)!)
    for (const group of [siblings(undefined), siblings('Each')]) {
      for (const [index, box] of group.entries()) for (const other of group.slice(index + 1)) expect(overlap(box, other)).toBe(false)
    }
    // Inside the Map, each box is placed within it
    const each = boxes.get('Each')!
    for (const inside of siblings('Each')) expect(inside.x + inside.width <= each.width && inside.y + inside.height <= each.height).toBe(true)
    expect(boxes.get('')!.x).toBeLessThan(boxes.get('Fetch')!.x)
    expect(boxes.get('Fetch')!.x).toBeLessThan(boxes.get('Any')!.x)
  })

  it('gives ELK each pin as a port where it is drawn, and wires their ports, a wire to a node without one its node', () => {
    const graph = { nodes: [], edges: [] } as unknown as Graph
    const elk = elkGraph(graph, {
      pure: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      sizes: new Map([['a', { width: 100, height: 60 }]]),
      ports: new Map([['a', [{ handle: 'out:/x', side: 'out', y: 20 }]], ['b', [{ handle: 'in:y', side: 'in', y: 30 }]]]),
      wires: [{ id: 'w', source: 'a', target: 'b', sourceHandle: 'out:/x', targetHandle: 'in:y' }, { id: 'v', source: 'a', target: 'c', sourceHandle: 'out:/x', targetHandle: 'in:z' }],
    })
    const a = elk.children!.find((node) => node.id === 'a')!
    expect(a.layoutOptions).toEqual({ 'elk.portConstraints': 'FIXED_POS' })
    expect(a.ports).toEqual([{ id: 'a\u0000out:/x', x: 100, y: 20, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } }])
    expect(elk.edges).toEqual([
      { id: 'w', sources: ['a\u0000out:/x'], targets: ['b\u0000in:y'] },
      { id: 'v', sources: ['a\u0000out:/x'], targets: ['c'] },
    ])
  })

  it('in data order, puts a node that one step reads in the layer just before that step', async () => {
    // a gives n through four steps, and s, which n reads too: s goes beside n, not beside a
    const ids = ['a', 'b1', 'b2', 'b3', 'b4', 'n', 's']
    const graph = { nodes: [], edges: [] } as unknown as Graph
    const wires = [['a', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'n'], ['a', 's'], ['s', 'n']].map(([source, target], index) => ({ id: `w${index}`, source: source!, target: target! }))
    const placed = async (dataOrder: boolean) => {
      const boxes = await layoutGraph(new ELK(), graph, { pure: ids.map((id) => ({ id })), wires, dataOrder })
      return { s: boxes.get('s')!.x, b4: boxes.get('b4')!.x, b1: boxes.get('b1')!.x }
    }
    const data = await placed(true)
    expect(data.s).toBe(data.b4)
    const sequence = await placed(false)
    expect(sequence.s).toBeLessThan(sequence.b4)
  })
})


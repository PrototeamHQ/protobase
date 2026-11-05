import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { definitionGraph } from './definition-graph'
import { layoutGraph, type Box } from './graph-layout'

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('layoutGraph', () => {
  it('places every node, no two of the same machine overlapping, each Map around its own and edges going down', async () => {
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
    expect(boxes.get('')!.y).toBeLessThan(boxes.get('Fetch')!.y)
    expect(boxes.get('Fetch')!.y).toBeLessThan(boxes.get('Any')!.y)
  })
})

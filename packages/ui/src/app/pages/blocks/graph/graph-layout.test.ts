import ELK from 'elkjs/lib/elk.bundled.js'
import { graphShape, type GraphShape } from '@protobase/layout'
import { describe, expect, it } from 'vitest'
import { edgeConditionsOf, edgeLook } from './graph-edges'
import { graphElk, nodeSize, placeGraph, type Box, type LayoutInput } from './graph-layout'

const elk = new ELK()

const serviceRows = [
  { id: 1, name: 'Gateway', area: 'edge' },
  { id: 2, name: 'Sign-in', area: 'edge' },
  { id: 3, name: 'Orders', area: 'core' },
  { id: 4, name: 'Billing', area: 'core' },
  { id: 5, name: 'Search', area: 'core' },
  { id: 6, name: 'Database', area: 'data' },
  { id: 7, name: 'Cron', area: null },
]
const linkRows = [
  { id: 101, from_id: 1, to_id: 3, state: 'busy', optional: false, protocol: 'https' },
  { id: 102, from_id: 1, to_id: 5, state: 'idle', optional: true, protocol: null },
  { id: 103, from_id: 2, to_id: 6, state: 'broken', optional: true, protocol: 'sql' },
  { id: 104, from_id: 3, to_id: 4, state: 'idle', optional: false, protocol: 'grpc' },
  { id: 105, from_id: 4, to_id: 6, state: 'idle', optional: false, protocol: 'sql' },
  { id: 106, from_id: 7, to_id: 3, state: 'idle', optional: false, protocol: null },
]

const fields = { label: 'name', group: 'area', source: 'from_id', target: 'to_id' }
const shapeOf = (nodes = serviceRows, edges = linkRows) => graphShape({ nodes, edges, key: 'id', edgeKey: ['id'], fields })

const input = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({ layout: 'layered', direction: 'down', sizes: new Map(), positions: new Map(), ...overrides })

const laidOut = async (shape: GraphShape, given: LayoutInput) => {
  const graph = graphElk(shape, given)
  return placeGraph(shape, given, graph && (await elk.layout(graph)))
}

const overlaps = (boxes: Box[]) => boxes.some((a, i) => boxes.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height))

const inside = (box: Box, region: Box) => box.x >= region.x && box.y >= region.y && box.x + box.width <= region.x + region.width && box.y + box.height <= region.y + region.height

describe('a graph’s layout', () => {
  it.each(['layered', 'force'] as const)('%s: draws the same picture from the same records, whatever order they come in', async (layout) => {
    const once = await laidOut(shapeOf(), input({ layout }))
    const again = await laidOut(shapeOf([...serviceRows].reverse(), [...linkRows].reverse()), input({ layout }))
    expect(again).toEqual(once)
  })

  it.each(['layered', 'force'] as const)('%s: puts each node in the region of its group, and no two nodes or regions on each other', async (layout) => {
    const shape = shapeOf()
    const placed = await laidOut(shape, input({ layout }))
    for (const node of shape.nodes.filter((each) => each.group !== undefined)) expect(inside(placed.nodes.get(node.id)!, placed.groups.get(node.group!)!)).toBe(true)
    expect(overlaps([...placed.nodes.values()])).toBe(false)
    expect(overlaps([...placed.groups.values()])).toBe(false)
    expect(Math.min(...[...placed.nodes.values(), ...placed.groups.values()].map((box) => box.x))).toBe(0)
  })

  it('runs down by default, and to the right when asked', async () => {
    const shape = shapeOf(serviceRows.slice(2, 5).map((row) => ({ ...row, area: null })), linkRows.filter((row) => row.id === 104))
    const down = await laidOut(shape, input())
    expect(down.nodes.get('4')!.y).toBeGreaterThan(down.nodes.get('3')!.y)
    const right = await laidOut(shape, input({ direction: 'right' }))
    expect(right.nodes.get('4')!.x).toBeGreaterThan(right.nodes.get('3')!.x)
  })

  it('places a node at its stored position and lays the others out under them, asking the engine nothing when all are placed', async () => {
    const shape = shapeOf()
    const positions = new Map([['1', { x: 500, y: 100 }], ['3', { x: 100, y: 100 }]])
    const placed = await laidOut(shape, input({ positions }))
    expect(placed.nodes.get('1')!.x - placed.nodes.get('3')!.x).toBe(400)
    const placedBottom = placed.nodes.get('3')!.y + nodeSize.height
    for (const id of ['2', '4', '5', '6', '7']) expect(placed.nodes.get(id)!.y).toBeGreaterThan(placedBottom)
    const all = new Map(shape.nodes.map((node, index) => [node.id, { x: index * 240, y: 0 }]))
    expect(graphElk(shape, input({ positions: all }))).toBeUndefined()
    expect(placeGraph(shape, input({ positions: all })).nodes.get('2')).toEqual({ x: 256, y: 32, width: 200, height: 64 })
  })

  it('lays a node out at the size it draws at', async () => {
    const shape = shapeOf()
    const placed = await laidOut(shape, input({ sizes: new Map([['3', { width: 224, height: 140 }]]) }))
    expect(placed.nodes.get('3')).toMatchObject({ width: 224, height: 140 })
    expect(overlaps([...placed.nodes.values()])).toBe(false)
  })
})

describe('an edge’s look', () => {
  const view = { name: 'links', fields: { state: { valueColors: { busy: 'blue', broken: 'red' } }, protocol: { valueLabels: { grpc: 'gRPC' } } } } as never
  const props = { edgeStatus: 'state', edgeLabel: 'protocol', animated: 'state = "busy"', dashed: 'optional = true', dotted: 'state = "broken"' }
  const looks = shapeOf().edges.map((edge) => edgeLook(edge, props, edgeConditionsOf(props), view))

  it('colours its line by its status, moves, dashes or dots it by its conditions, and labels it with its value label', () => {
    expect(looks.map((look) => look.stroke)).toEqual(['var(--color-primary)', 'var(--color-border-strong)', 'var(--color-danger)', 'var(--color-border-strong)', 'var(--color-border-strong)', 'var(--color-border-strong)'])
    expect(looks.map((look) => look.animated)).toEqual([true, false, false, false, false, false])
    // Dotted wins over dashed
    expect(looks.map((look) => look.dash)).toEqual([undefined, '6 4', '1.5 4', undefined, undefined, undefined])
    expect(looks.map((look) => look.label)).toEqual(['https', undefined, 'sql', 'gRPC', 'sql', undefined])
  })

  it('draws plain without the props, and never holds a condition that does not parse', () => {
    const edge = shapeOf().edges[0]!
    expect(edgeLook(edge, {}, edgeConditionsOf({ animated: 'state ==' }), undefined)).toEqual({ stroke: 'var(--color-border-strong)', animated: false })
  })
})

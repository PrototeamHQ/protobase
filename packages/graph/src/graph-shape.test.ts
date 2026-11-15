import { describe, expect, it } from 'vitest'
import { graphLayout, type Box } from './graph-layout'
import { graphShape } from './graph-shape'
import { linkRows, sampleFields, serviceRows } from './testing/sample-graph'

const shapeOf = (nodes: Record<string, unknown>[] = serviceRows, edges: Record<string, unknown>[] = linkRows) => graphShape({ nodes, edges, key: 'id', edgeKey: ['id'], fields: sampleFields })

describe('a graph’s shape', () => {
  it('groups the nodes by their group value and keeps every edge between two of them', () => {
    const shape = shapeOf()
    expect(shape.groups.map((group) => group.id)).toEqual(['core', 'data', 'edge'])
    expect(shape.nodes.filter((node) => node.group === 'core').map((node) => node.row.name)).toEqual(['Orders', 'Billing', 'Search', 'Mailer'])
    expect(shape.edges).toHaveLength(11)
  })

  it('skips an edge to a node that is not among the nodes, and one without both ends', () => {
    const shape = shapeOf(serviceRows, [...linkRows, { id: 113, from_id: 1, to_id: null }])
    expect(shape.edges.map((edge) => edge.id)).not.toContain('112')
    expect(shape.edges.map((edge) => edge.id)).not.toContain('113')
  })

  it('leaves a node without a group value outside every group', () => {
    const shape = shapeOf([...serviceRows, { id: 11, name: 'Cron', area: null, health: 'up' }], [])
    expect(shape.nodes.find((node) => node.id === '11')).toEqual({ id: '11', row: { id: 11, name: 'Cron', area: null, health: 'up' } })
    expect(shape.groups).toHaveLength(3)
  })
})

describe('a graph’s layout', () => {
  it('draws the same picture from the same records, whatever order they come in', () => {
    const once = graphLayout(shapeOf())
    const again = graphLayout(shapeOf([...serviceRows].reverse(), [...linkRows].reverse()))
    expect(again).toEqual(once)
    expect(graphLayout(shapeOf())).toEqual(once)
  })

  it('puts each node inside the box of its group, and no two nodes or groups on each other', () => {
    const shape = shapeOf()
    const layout = graphLayout(shape)
    for (const node of shape.nodes) {
      const box = layout.nodes.get(node.id)!
      const group = layout.groups.get(node.group!)!
      expect(box.x).toBeGreaterThanOrEqual(group.x)
      expect(box.y).toBeGreaterThanOrEqual(group.y)
      expect(box.x + box.width).toBeLessThanOrEqual(group.x + group.width)
      expect(box.y + box.height).toBeLessThanOrEqual(group.y + group.height)
    }
    const overlaps = (boxes: Box[]) => boxes.some((a, i) => boxes.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height))
    expect(overlaps([...layout.nodes.values()])).toBe(false)
    expect(overlaps([...layout.groups.values()])).toBe(false)
  })
})

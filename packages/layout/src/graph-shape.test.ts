import { describe, expect, it } from 'vitest'
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

  it('keeps apart two edges whose key fields differ only in where a comma falls', () => {
    const nodes = [{ id: 1 }, { id: 2 }]
    const edges = [{ a: 'a,b', b: 'c', from_id: 1, to_id: 2 }, { a: 'a', b: 'b,c', from_id: 1, to_id: 2 }]
    const shape = graphShape({ nodes, edges, key: 'id', edgeKey: ['a', 'b'], fields: sampleFields })
    expect(new Set(shape.edges.map((edge) => edge.id)).size).toBe(2)
  })

  it('leaves a node without a group value outside every group', () => {
    const shape = shapeOf([...serviceRows, { id: 11, name: 'Cron', area: null, health: 'up' }], [])
    expect(shape.nodes.find((node) => node.id === '11')).toEqual({ id: '11', row: { id: 11, name: 'Cron', area: null, health: 'up' } })
    expect(shape.groups).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import graph, { Graph } from './index'

describe('the graph plugin', () => {
  it('registers the Graph component the layout block names', () => {
    expect(graph.name).toBe('graph')
    expect(graph.components).toEqual({ Graph })
  })
})

type Row = Record<string, unknown>

/** The fields a graph reads: a node's `label`, `group` and `status`, and the node keys an edge's `source` and `target` hold. */
export type GraphFields = { label: string; group?: string; status?: string; source: string; target: string }

export type ShapeNode = { id: string; row: Row; group?: string }
export type ShapeGroup = { id: string; value: unknown }
export type ShapeEdge = { id: string; source: string; target: string }

/** What a graph shows: its groups, its nodes, each in its group, and the edges between them, each in one fixed order. */
export type GraphShape = { groups: ShapeGroup[]; nodes: ShapeNode[]; edges: ShapeEdge[] }

const keyText = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : String(value))

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The graph `nodes` and `edges` make: a node per record by its `key` field, an edge by its `edgeKey` field, in the group its `group` value names, and
 * an edge per record whose `source` and `target` are both among the nodes; one pointing elsewhere is left out. Groups,
 * nodes and edges are each sorted by key, so the same records make the same graph whatever order they come in.
 */
export const graphShape = ({ nodes, edges, key, edgeKey, fields }: { nodes: Row[]; edges: Row[]; key: string; edgeKey: string; fields: GraphFields }): GraphShape => {
  const byKey = new Map<string, ShapeNode>()
  const groups = new Map<string, ShapeGroup>()
  for (const row of nodes) {
    const id = keyText(row[key])
    if (id === undefined || byKey.has(id)) continue
    const value = fields.group === undefined ? undefined : row[fields.group]
    const group = keyText(value)
    if (group !== undefined && !groups.has(group)) groups.set(group, { id: group, value })
    byKey.set(id, { id, row, ...(group !== undefined && { group }) })
  }
  const linked = edges.flatMap((row) => {
    const id = keyText(row[edgeKey])
    const source = keyText(row[fields.source])
    const target = keyText(row[fields.target])
    if (id === undefined || source === undefined || target === undefined || !byKey.has(source) || !byKey.has(target)) return []
    return [{ id, source, target }]
  })
  return {
    groups: [...groups.values()].sort((a, b) => byText(a.id, b.id)),
    nodes: [...byKey.values()].sort((a, b) => byText(a.id, b.id)),
    edges: linked.sort((a, b) => byText(a.source, b.source) || byText(a.target, b.target) || byText(a.id, b.id)),
  }
}

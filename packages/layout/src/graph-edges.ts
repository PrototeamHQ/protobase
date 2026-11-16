import { parseCondition } from './condition'
import { sampleSlots } from './filter-slots'
import type { LayoutNode } from './node'

/** The conditions on a graph's edge, each evaluated per edge as the graph draws. */
export const edgeConditions = ['animated', 'dashed', 'dotted'] as const

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A condition on an edge: its `{{path}}`s are the scope's around the graph, filled before it draws; its fields the edge's. */
export const edgeCondition = (when: string) => parseCondition(sampleSlots(when).text)

/** The fields of an edge a graph's conditions compare, which its read asks for. */
export const edgeConditionFields = (node: LayoutNode): string[] =>
  edgeConditions.flatMap((name) => {
    const when = text(node.props[name])
    const parsed = when === undefined ? undefined : edgeCondition(when)
    return parsed?.ok ? parsed.paths.map((path) => path.split('.')[0]!) : []
  })

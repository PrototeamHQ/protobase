import type { DataEdge, DataGraph, PureNode } from './data-graph'
import { inKey } from './pure-ids'

/**
 * Where among a step's Condition's nodes a removal takes an input away: a wire into a condition node's input, by the
 * node's place and the input; undefined for any other wire.
 */
export const wirePlace = (graph: DataGraph, edge: Pick<DataEdge, 'target' | 'targetHandle'>) => {
  const pure = graph.pure.find((node) => node.id === edge.target)
  const key = inKey(edge.targetHandle)
  return pure?.kind === 'condition' && key !== undefined ? { step: pure.target, at: [...pure.at, Number(key)] } : undefined
}

/** Where a condition node's removal takes its input away among its step's Condition's nodes; undefined for any other node. */
export const nodePlace = (node: PureNode) => (node.kind === 'condition' ? { step: node.target, at: node.at } : undefined)

// Whether `a` comes after `b` among a Condition's nodes, by the inputs on the way to it
const later = (a: readonly number[], b: readonly number[]): number => {
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index]! - b[index]!
  return a.length - b.length
}

/**
 * Removals in the order that keeps each one's place: an All of or an Any of that loses an input moves the inputs after
 * it up, so the removals in one step's Condition go together, the last place first, each place as the graph drawn
 * before them all names it. The steps keep the order their first removal came in, and every other removal its own.
 */
export const lastPlaceFirst = <T>(_graph: DataGraph, removals: readonly T[], placeOf: (removal: T) => { step: string; at: number[] } | undefined): T[] => {
  const groups = new Map<string, { removal: T; at: number[] }[]>()
  const order: (T | string)[] = []
  for (const removal of removals) {
    const place = placeOf(removal)
    if (!place) {
      order.push(removal)
      continue
    }
    const key = `step:${place.step}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push({ removal, at: place.at })
  }
  return order.flatMap((each) => (typeof each === 'string' && groups.has(each) ? groups.get(each)!.toSorted((a, b) => later(b.at, a.at)).map(({ removal }) => removal) : [each as T]))
}

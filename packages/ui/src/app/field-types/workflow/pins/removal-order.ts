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
 * it up, so of the removals in one step's Condition the last place goes first, each place as the graph drawn before
 * them all names it. Removals elsewhere keep their order.
 */
export const lastPlaceFirst = <T>(graph: DataGraph, removals: readonly T[], placeOf: (removal: T) => { step: string; at: number[] } | undefined): T[] =>
  removals
    .map((removal, index) => ({ removal, index, place: placeOf(removal) }))
    .sort((a, b) => (a.place && b.place && a.place.step === b.place.step ? later(b.place.at, a.place.at) : a.index - b.index))
    .map(({ removal }) => removal)

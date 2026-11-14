import { dependsOn, fits, machineDependencies, orderOf, referenceValue, type Definition, type Reference } from '@protobase/workflows'
import { machineAt, splitPath, stateAt, triggerId } from '../definition'
import { earlierSteps, shapesItsOutput, variableFor } from '../../workflow-page/value-insert'
import { setArgument } from './argument-edits'
import type { DataEdge, DataGraph, PureNode } from './data-graph'
import { statusKey, type OutputPin } from './node-pins'
import { inKey, outPath } from './pure-ids'

/** One end of a wire: a node and its handle. */
export type PinEnd = { node: string; handle: string }

/** Why a wire cannot be drawn: its source does not run before its target, gives a shaped output, or has a type the input does not take. */
export type WireRefusal = { reason: 'notBefore'; step: string } | { reason: 'shapesOutput'; step: string } | { reason: 'type'; source: OutputPin['type']; target: OutputPin['type'] } | { reason: 'notPins' }

const pureOf = (graph: DataGraph, id: string) => graph.pure.find((node) => node.id === id)

// The node and path a value comes from, through the Breaks it passes: the trigger or a state, and the path in what it gives
const origin = (graph: DataGraph, end: PinEnd): { node: string; path: string[] } | undefined => {
  const path = outPath(end.handle)
  if (!path) return
  const pure = pureOf(graph, end.node)
  if (!pure) return { node: end.node, path }
  return pure.kind === 'break' ? { node: pure.source, path: [...pure.path, ...path] } : undefined
}

// The step an input belongs to, and the keys of its Arguments the input sets
const destination = (graph: DataGraph, end: PinEnd): { step: string; keys: string[] } | undefined => {
  const key = inKey(end.handle)
  if (key === undefined) return
  const pure = pureOf(graph, end.node)
  if (!pure) return graph.inputs.has(end.node) ? { step: end.node, keys: [key] } : undefined
  return pure.kind === 'make' ? { step: pure.target, keys: [pure.key, key] } : undefined
}

const pinType = (graph: DataGraph, end: PinEnd, side: 'out' | 'in') => {
  const pure = pureOf(graph, end.node)
  if (side === 'out') {
    const path = outPath(end.handle)!
    const pins = pure?.kind === 'break' ? pure.outputs : graph.outputs.get(end.node) ?? []
    return pins.find((pin) => JSON.stringify(pin.path) === JSON.stringify(path))?.type
  }
  const key = inKey(end.handle)!
  const pins = pure?.kind === 'make' ? pure.inputs : graph.inputs.get(end.node) ?? []
  return pins.find((pin) => pin.key === key)?.type
}

// A step inside a Block reads only the Block's own input, never the run's
const inBlock = (definition: Definition, step: string) => splitPath(step).scope.some((_, index, scope) => stateAt(definition, scope.slice(0, index + 1).join('/'))?.Type === 'Block')

// In data order, whether `from` already runs after `to`, so a read of it by `to` would make them wait on each other
const runsAfter = (definition: Definition, from: string, to: string) => {
  const { scope, name } = splitPath(from)
  if (splitPath(to).scope.join('/') !== scope.join('/')) return false
  const dependencies = machineDependencies(machineAt(definition, scope)!)
  const seen = new Set<string>()
  const stack = [name]
  while (stack.length > 0) {
    const next = stack.pop()!
    if (next === splitPath(to).name) return true
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...dependsOn(dependencies.get(next) ?? { data: new Set(), status: new Set(), handled: new Set() }))
  }
  return false
}

/** Why a wire from `from` to `to` cannot be drawn, or undefined when it can. */
export const wireRefusal = (definition: Definition, graph: DataGraph, from: PinEnd, to: PinEnd): WireRefusal | undefined => {
  const source = origin(graph, from)
  const target = destination(graph, to)
  if (!source || !target) return { reason: 'notPins' }
  if (orderOf(definition) === 'data' && source.node !== triggerId) {
    // In data order a read is what orders the states: any state may read another that does not run after it
    if (runsAfter(definition, source.node, target.step)) return { reason: 'notBefore', step: splitPath(source.node).name }
    if (source.path[0] !== statusKey && shapesItsOutput(definition, source.node)) return { reason: 'shapesOutput', step: splitPath(source.node).name }
  } else if (source.node === triggerId) {
    if (inBlock(definition, target.step)) return { reason: 'notBefore', step: splitPath(target.step).name }
  } else {
    if (!earlierSteps(definition, target.step).includes(source.node)) return { reason: 'notBefore', step: splitPath(source.node).name }
    if (shapesItsOutput(definition, source.node)) return { reason: 'shapesOutput', step: splitPath(source.node).name }
  }
  const given = pinType(graph, from, 'out')
  const taken = pinType(graph, to, 'in')
  if (given && taken && !fits(given, taken)) return { reason: 'type', source: given, target: taken }
  return
}

/**
 * Draws a wire: the input it ends at reads the value its start gives by name, `$<variable>.<path>` for a step's result,
 * which gets a variable to keep it when it has none, or the run's input for the trigger's. The definition stays as it
 * is when the wire is refused.
 */
export const connectData = (definition: Definition, graph: DataGraph, from: PinEnd, to: PinEnd): Definition => {
  if (wireRefusal(definition, graph, from, to)) return definition
  const source = origin(graph, from)!
  const target = destination(graph, to)!
  let next = definition
  let reference: Reference
  if (source.node === triggerId) reference = { base: { input: true }, path: source.path }
  else if (source.path[0] === statusKey) reference = { base: { step: splitPath(source.node).name }, path: source.path.slice(1) }
  else {
    const kept = variableFor(definition, source.node)
    next = kept.definition
    reference = { base: { variable: kept.variable }, path: source.path }
  }
  return setArgument(next, target.step, target.keys, referenceValue(reference))
}

/** Removes a wire: the input it ends at holds nothing. A wire into a Break or out of a Make goes with that node. */
export const disconnectData = (definition: Definition, graph: DataGraph, edge: Pick<DataEdge, 'target' | 'targetHandle' | 'source'>): Definition => {
  const target = destination(graph, { node: edge.target, handle: edge.targetHandle })
  if (target) return setArgument(definition, target.step, target.keys, undefined)
  const pure = pureOf(graph, edge.target) ?? pureOf(graph, edge.source)
  return pure ? removePure(definition, graph, pure) : definition
}

/** Removes a Break, and every input that reads through it; or a Make, and the argument it builds. */
export const removePure = (definition: Definition, graph: DataGraph, node: PureNode): Definition => {
  if (node.kind === 'make') return setArgument(definition, node.target, [node.key], undefined)
  return graph.edges.filter((edge) => edge.source === node.id).reduce((next, edge) => {
    const after = pureOf(graph, edge.target)
    if (after?.kind === 'break') return removePure(next, graph, after)
    return disconnectData(next, graph, edge)
  }, definition)
}

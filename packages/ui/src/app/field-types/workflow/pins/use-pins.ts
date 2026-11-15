import type { Connection, Edge, FinalConnectionState } from '@xyflow/react'
import { useMemo, useState, type RefObject } from 'react'
import type { Definition, PinSchemas } from '@protobase/workflows'
import type { Graph } from '../definition-graph'
import { graphId, isPureFlowId } from '../flow-elements'
import { text } from '../messages'
import { setArgument } from './argument-edits'
import { connectData, disconnectData, removePure, wireRefusal, type PinEnd } from './data-edits'
import { dataGraph, type DataEdge, type LocalPure, type PureNode } from './data-graph'
import { nodeSizes } from './node-sizes'
import type { PinActions } from './pin-actions'
import { typeLabel } from './pin-text'
import type { PureOffer } from './pure-offer'
import { breakId, inKey, makeId, outPath } from './pure-ids'
import { pureParent } from './pure-parents'
import { refusalText } from './refusal-text'
import type { WireCheck } from './wire-line'

/** Whether a handle is a pin's, rather than one execution runs along. */
export const isPinHandle = (handle: string | null | undefined) => inKey(handle) !== undefined || outPath(handle) !== undefined

const end = (node: string, handle: string | null | undefined): PinEnd => ({ node: graphId(node), handle: handle ?? '' })

const isObjectType = (kinds: readonly string[] | 'any') => kinds !== 'any' && kinds.includes('object')

/**
 * The Breaks and Makes made on the canvas that stay once `gone` are removed: those, and each Break made from a field of
 * a removed Break, which takes its object from it.
 */
export const localsLeft = (local: readonly LocalPure[], gone: readonly PureNode[]): LocalPure[] => {
  const id = (each: LocalPure) => (each.kind === 'break' ? breakId(each.source, each.path) : makeId(each.target, each.key))
  const under = (each: LocalPure) => each.kind === 'break' && gone.some((parent) => parent.kind === 'break' && parent.source === each.source && parent.path.every((step, index) => each.path[index] === step))
  return local.filter((each) => !under(each) && !gone.some((node) => node.id === id(each)))
}

/**
 * The pins of a canvas, given the schemas their types come from: the data graph with the Break and Make nodes made on
 * the canvas, which inputs are open, what the layout places, and what wiring, unwiring, removing a Break or a Make and
 * letting go of a wire on the empty canvas do. Without schemas, no pins.
 */
export const usePins = (definition: Definition, graph: Graph, schemas: PinSchemas | undefined, onChange: ((definition: Definition) => void) | undefined, frame: RefObject<HTMLElement | null>) => {
  const [local, setLocal] = useState<LocalPure[]>([])
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [offer, setOffer] = useState<PureOffer>()
  const data = useMemo(() => schemas && dataGraph(definition, schemas, local), [definition, schemas, local])
  const layout = useMemo(() => {
    if (!data) return
    return {
      sizes: nodeSizes(graph, data, open),
      pure: data.pure.map((pure) => ({ id: pure.id, parent: pureParent(graph, pure) })),
      wires: data.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    }
  }, [graph, data, open])

  const actions: PinActions | undefined = onChange && {
    setArgument: (step, keys, value) => onChange(setArgument(definition, step, keys, value)),
    toggleOpen: (node) => setOpen((current) => (current.has(node) ? new Set([...current].filter((id) => id !== node)) : new Set([...current, node]))),
  }
  const check: WireCheck = (from, to) => {
    if (!data || !isPinHandle(from.handle) || !isPinHandle(to.handle)) return
    // A wire may be dragged from its input end
    const [start, finish] = outPath(from.handle) ? [from, to] : [to, from]
    const refusal = wireRefusal(definition, data, end(start.node, start.handle), end(finish.node, finish.handle))
    return refusal && refusalText(refusal)
  }
  const isValid = (connection: Connection | Edge) => Boolean(data) && wireRefusal(definition, data!, end(connection.source, connection.sourceHandle), end(connection.target, connection.targetHandle)) === undefined
  const connect = (connection: Connection) => {
    if (!onChange || !data) return
    onChange(connectData(definition, data, end(connection.source, connection.sourceHandle), end(connection.target, connection.targetHandle)))
  }
  // Wires cut and Breaks and Makes removed, from what the other removals left. Cutting the wire a Break takes its object
  // by, or a Make gives its object by, removes that node, which has no place without it.
  const remove = (next: Definition, nodes: readonly { id: string }[], edges: readonly Edge[]) => {
    if (!data) return next
    let after = next
    const bound = edges.flatMap((edge) => {
      const wire = (edge.data as { wire?: DataEdge } | undefined)?.wire
      const pure = wire && data.pure.find((each) => (each.kind === 'break' && each.id === wire.target) || (each.kind === 'make' && each.id === wire.source))
      return pure ? [{ id: pure.id }] : []
    })
    const gone = [...nodes.filter((node) => isPureFlowId(node.id)), ...bound.filter((node) => !nodes.some((other) => other.id === node.id))]
    for (const edge of edges) {
      const wire = (edge.data as { kind?: string; wire?: DataEdge } | undefined)?.wire
      if (wire && !gone.some((node) => node.id === wire.source || node.id === wire.target)) after = disconnectData(after, data, wire)
    }
    for (const node of gone) {
      const pure = data.pure.find((each) => each.id === node.id)
      if (pure) after = removePure(after, data, pure)
    }
    if (gone.length > 0) setLocal((current) => localsLeft(current, gone.flatMap((node) => data.pure.filter((each) => each.id === node.id))))
    return after
  }
  // A wire from an object pin let go on the empty canvas offers to take that object apart, or to build it, there
  const connectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!data || !onChange || state.isValid || state.toHandle || !state.fromHandle?.id || !state.fromNode) return
    const node = graphId(state.fromNode.id)
    const handle = state.fromHandle.id
    const point = 'changedTouches' in event ? event.changedTouches[0]! : event
    const box = frame.current?.getBoundingClientRect()
    const at = { x: point.clientX - (box?.left ?? 0), y: point.clientY - (box?.top ?? 0) }
    const path = outPath(handle)
    if (path) {
      const pure = data.pure.find((each) => each.id === node)
      const pins = pure?.kind === 'break' ? pure.outputs : data.outputs.get(node) ?? []
      const type = pins.find((pin) => JSON.stringify(pin.path) === JSON.stringify(path))?.type
      if (!type || !isObjectType(type.kinds)) return
      const source = pure?.kind === 'break' ? { source: pure.source, path: [...pure.path, ...path] } : { source: node, path }
      setOffer({ ...at, label: text('breakTitle', { type: typeLabel(type) }), add: () => setLocal((current) => [...current, { kind: 'break', ...source }]) })
      return
    }
    const key = inKey(handle)
    const pin = key === undefined ? undefined : data.inputs.get(node)?.find((each) => each.key === key)
    if (!pin || !isObjectType(pin.type.kinds) || pin.state === 'wired' || pin.state === 'expression') return
    setOffer({ ...at, label: text('makeTitle', { type: typeLabel(pin.type) }), add: () => setLocal((current) => [...current, { kind: 'make', target: node, key: pin.key }]) })
  }
  return { data, open, layout, actions, check, isValid, connect, remove, connectEnd, offer, closeOffer: () => setOffer(undefined) }
}

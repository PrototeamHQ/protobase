import type { Connection, Edge, FinalConnectionState } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { orderOf, type Definition, type PinSchemas } from '@protobase/workflows'
import type { Graph } from '../definition-graph'
import type { CanvasEdits } from '../canvas-edits'
import { graphId, isPureFlowId } from '../flow-elements'
import { text } from '../messages'
import type { ConditionChoice } from './condition-edits'
import type { PinEnd } from './data-edits'
import { lastPlaceFirst, nodePlace, wirePlace } from './removal-order'
import { dataGraph, type DataEdge, type LocalPure, type PureNode } from './data-graph'
import { conditionKey } from './node-pins'
import { nodeSizes, pinPorts } from './node-sizes'
import type { PinActions } from './pin-actions'
import { conditionTitle, typeLabel } from './pin-text'
import type { PureOffer } from './pure-offer'
import { breakId, inKey, makeId, outPath } from './pure-ids'
import { pureParent } from './pure-parents'
import { refusalText } from './refusal-text'
import type { WireCheck } from './wire-line'

/** Whether a handle is a pin's, rather than one execution runs along. */
export const isPinHandle = (handle: string | null | undefined) => inKey(handle) !== undefined || outPath(handle) !== undefined

const end = (node: string, handle: string | null | undefined): PinEnd => ({ node: graphId(node), handle: handle ?? '' })

const isObjectType = (kinds: readonly string[] | 'any') => kinds !== 'any' && kinds.includes('object')

// The offer of each condition node of `choices`, each written where `put` puts it
const conditionOffer = (choices: readonly ConditionChoice[], put: (choice: ConditionChoice) => void) => choices.map((choice) => ({ label: conditionTitle(choice), add: () => put(choice) }))

/**
 * The Breaks and Makes made on the canvas that stay once `gone` are removed: those, and each Break made from a field of
 * a removed Break, which takes its object from it.
 */
export const localsLeft = (local: readonly LocalPure[], gone: readonly PureNode[]): LocalPure[] => {
  const id = (each: LocalPure) => (each.kind === 'break' ? breakId(each.source, each.path) : makeId(each.target, each.key))
  const under = (each: LocalPure) => each.kind === 'break' && gone.some((parent) => parent.kind === 'break' && parent.source === each.source && parent.path.every((step, index) => each.path[index] === step))
  return local.filter((each) => !under(each) && !gone.some((node) => node.id === id(each)))
}

/** What an editable canvas's pins change: the definition, through `onChange`, by `edits`. */
export type PinEditing = { onChange: (definition: Definition) => void; edits: CanvasEdits }

/**
 * The pins of a canvas, given the schemas their types come from: the data graph with the Break and Make nodes made on
 * the canvas, which inputs are open, what the layout places, and with `editing`, what wiring, unwiring, removing a
 * Break, a Make or a condition node and letting go of a wire on the empty canvas do. Without schemas, no pins.
 */
export const usePins = (definition: Definition, graph: Graph, schemas: PinSchemas | undefined, editing: PinEditing | undefined, frame: RefObject<HTMLElement | null>) => {
  const edits = editing?.edits
  const [local, setLocal] = useState<LocalPure[]>([])
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [offer, setOffer] = useState<PureOffer>()
  // The definition and editing as they are now, which a choice made in an offer opened before an edit applies to
  const now = useRef({ definition, editing })
  useEffect(() => {
    now.current = { definition, editing }
  })
  const data = useMemo(() => schemas && dataGraph(definition, schemas, local), [definition, schemas, local])
  const dataOrder = orderOf(definition) === 'data'
  const layout = useMemo(() => {
    if (!data) return
    return {
      sizes: nodeSizes(graph, data, open),
      pure: data.pure.map((pure) => ({ id: pure.id, parent: pureParent(graph, pure) })),
      wires: data.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
      ports: pinPorts(graph, data, open),
      dataOrder,
    }
  }, [graph, data, open, dataOrder])

  const actions: PinActions | undefined = editing && {
    setArgument: (step, keys, value) => editing.onChange(editing.edits.setArgument(definition, step, keys, value)),
    setConditionSide: (step, at, value) => editing.onChange(editing.edits.setConditionSide(definition, step, at, { value })),
    setCondition: (step, value) => editing.onChange(editing.edits.setArgument(definition, step, [conditionKey], value)),
    toggleOpen: (node) => setOpen((current) => (current.has(node) ? new Set([...current].filter((id) => id !== node)) : new Set([...current, node]))),
  }
  const check: WireCheck = (from, to) => {
    if (!data || !edits || !isPinHandle(from.handle) || !isPinHandle(to.handle)) return
    // A wire may be dragged from its input end
    const [start, finish] = outPath(from.handle) ? [from, to] : [to, from]
    const refusal = edits.wireRefusal(definition, data, end(start.node, start.handle), end(finish.node, finish.handle))
    return refusal && refusalText(refusal)
  }
  const isValid = (connection: Connection | Edge) => Boolean(data && edits) && edits!.wireRefusal(definition, data!, end(connection.source, connection.sourceHandle), end(connection.target, connection.targetHandle)) === undefined
  const connect = (connection: Connection) => {
    if (!editing || !data) return
    editing.onChange(editing.edits.connectData(definition, data, end(connection.source, connection.sourceHandle), end(connection.target, connection.targetHandle)))
  }
  // Wires cut and Breaks and Makes removed, from what the other removals left. Cutting the wire a Break takes its object
  // by, or a Make gives its object by, removes that node, which has no place without it.
  const remove = (next: Definition, nodes: readonly { id: string }[], edges: readonly Edge[]) => {
    if (!data || !edits) return next
    let after = next
    const bound = edges.flatMap((edge) => {
      const wire = (edge.data as { wire?: DataEdge } | undefined)?.wire
      const pure = wire && data.pure.find((each) => (each.kind === 'break' && each.id === wire.target) || (each.kind === 'make' && each.id === wire.source))
      return pure ? [{ id: pure.id }] : []
    })
    const gone = [...nodes.filter((node) => isPureFlowId(node.id)), ...bound.filter((node) => !nodes.some((other) => other.id === node.id))]
    // Wires cut and nodes removed, the last inputs of a Condition's nodes first, so none moves another's place
    const cut = edges.flatMap((edge) => {
      const wire = (edge.data as { kind?: string; wire?: DataEdge } | undefined)?.wire
      return wire && !gone.some((node) => node.id === wire.source || node.id === wire.target) ? [{ wire }] : []
    })
    const removed = gone.flatMap((node) => data.pure.filter((each) => each.id === node.id).map((pure) => ({ pure })))
    const removals: ({ wire: DataEdge } | { pure: PureNode })[] = [...cut, ...removed]
    for (const removal of lastPlaceFirst(data, removals, (each) => ('wire' in each ? wirePlace(data, each.wire) : nodePlace(each.pure)))) {
      after = 'wire' in removal ? edits.disconnectData(after, data, removal.wire) : edits.removePure(after, data, removal.pure)
    }
    if (gone.length > 0) setLocal((current) => localsLeft(current, gone.flatMap((node) => data.pure.filter((each) => each.id === node.id))))
    return after
  }
  // A Select chosen in an offer, added to the definition as it is when it is chosen
  const addSelect = (step: string, key: string) => {
    const { definition: current, editing: latest } = now.current
    latest?.onChange(latest.edits.addSelect(current, step, key))
  }
  // A condition node chosen in an offer, added to the definition as it is when it is chosen
  const addCondition = (step: string, at: readonly number[], choice: ConditionChoice) => {
    const { definition: current, editing: latest } = now.current
    latest?.onChange(latest.edits.addCondition(current, step, at, choice))
  }
  // A wire from an object pin let go on the empty canvas offers to take that object apart, or to build it, there; one
  // from an empty Only when pin, or an input of an All of, an Any of or a Not that holds a value or none, the condition nodes
  const connectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!data || !editing || state.isValid || state.toHandle || !state.fromHandle?.id || !state.fromNode) return
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
      setOffer({ ...at, choices: [{ label: text('breakTitle', { type: typeLabel(type) }), add: () => setLocal((current) => [...current, { kind: 'break', ...source }]) }] })
      return
    }
    const key = inKey(handle)
    const condition = data.pure.find((each) => each.id === node)
    if (condition?.kind === 'condition') {
      const side = condition.inputs.find((each) => each.key === key)
      // An input of an All of, an Any of or a Not that holds a value, or the empty one after an All of's or Any of's last
      if (!side || (side.state !== 'literal' && side.state !== 'empty') || (condition.part.kind !== 'logic' && condition.part.kind !== 'not')) return
      setOffer({ ...at, choices: conditionOffer(editing.edits.conditionChoices(false), (choice) => addCondition(condition.target, [...condition.at, Number(key)], choice)) })
      return
    }
    const pin = key === undefined ? undefined : data.inputs.get(node)?.find((each) => each.key === key)
    if (pin?.key === conditionKey && pin.state === 'empty') {
      setOffer({ ...at, choices: conditionOffer(editing.edits.conditionChoices(true), (choice) => addCondition(node, [], choice)) })
      return
    }
    // An input of a value, empty or holding one of its own, can have a Select choose it from another value
    if (pin && pin.key !== conditionKey && !isObjectType(pin.type.kinds) && (pin.state === 'empty' || pin.state === 'literal')) {
      setOffer({ ...at, choices: [{ label: text('selectOffer'), add: () => addSelect(node, pin.key) }] })
      return
    }
    if (!pin || !isObjectType(pin.type.kinds) || pin.state === 'wired' || pin.state === 'expression') return
    setOffer({ ...at, choices: [{ label: text('makeTitle', { type: typeLabel(pin.type) }), add: () => setLocal((current) => [...current, { kind: 'make', target: node, key: pin.key }]) }] })
  }
  return { data, open, layout, actions, check, isValid, connect, remove, connectEnd, offer, closeOffer: () => setOffer(undefined) }
}

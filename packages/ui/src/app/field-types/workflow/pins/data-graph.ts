import { allStates, inputSchema, orderOf, parseReference, pinType, resultRead, schemaAt, type Definition, type PinSchemas, type PinType, type State } from '@protobase/workflows'
import { pathOfName, triggerId } from '../definition'
import { conditionPin, fieldsOf, givenSchema, inputPin, inputPins, statusKey, statusPin, stepOutputs, triggerOutputs, type InputPin, type OutputPin } from './node-pins'
import { breakId, breakIn, inHandle, makeId, makeOut, outHandle } from './pure-ids'

/** A Break node: the fields of the object a node gives at `path`, each a pin of its own. */
export type BreakNode = { kind: 'break'; id: string; source: string; path: string[]; type: PinType; outputs: OutputPin[] }

/** A Make node: the object a step's argument `key` holds, built from a pin per field. */
export type MakeNode = { kind: 'make'; id: string; target: string; key: string; type: PinType; inputs: InputPin[] }

export type PureNode = BreakNode | MakeNode

/** A wire from an output pin to an input pin, of the type of the value it carries. */
export type DataEdge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string; type: PinType }

/** A Break or Make made on the canvas, which the document holds nothing for until a wire runs through it. */
export type LocalPure = { kind: 'break'; source: string; path: string[] } | { kind: 'make'; target: string; key: string }

/** The data side of the graph: every node's pins, the Break and Make nodes, and the wires. */
export type DataGraph = { inputs: Map<string, InputPin[]>; outputs: Map<string, OutputPin[]>; pure: PureNode[]; edges: DataEdge[] }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, index) => key === b[index])

// The path of every state that keeps its whole result in a variable, by the variable, when exactly one does.
const resultVariables = (definition: Definition) => {
  const found = new Map<string, string | null>()
  for (const [name, state] of allStates(definition.stateMachine)) {
    const assign = 'Assign' in state && isObject(state.Assign) ? state.Assign : {}
    for (const [variable, value] of Object.entries(assign)) {
      const path = value === resultRead ? pathOfName(definition.stateMachine, name)?.join('/') : undefined
      found.set(variable, found.has(variable) || path === undefined ? null : path)
    }
  }
  return found
}

/**
 * The data side of a definition: each step's input pins and each node's output pins by their types, a wire for each
 * argument that is one read by name, through a Break node for each object a read goes into, and a Make node for each
 * argument written as an object whose fields read values, with the Breaks and Makes of `local` besides.
 */
export const dataGraph = (definition: Definition, schemas: PinSchemas, local: readonly LocalPure[] = []): DataGraph => {
  const states = new Map<string, State>(allStates(definition.stateMachine).map(([name, state]) => [pathOfName(definition.stateMachine, name)!.join('/'), state]))
  // In data order every state has an Only when pin first and a status pin last
  const data = orderOf(definition) === 'data'
  const outputs = new Map<string, OutputPin[]>([[triggerId, triggerOutputs(definition, schemas)], ...[...states].map(([path, state]): [string, OutputPin[]] => [path, [...stepOutputs(state, schemas), ...(data ? [statusPin] : [])]])])
  const inputs = new Map([...states].filter(([, state]) => data || state.Type === 'Task').map(([path, state]) => [path, [...(data ? [conditionPin(state)] : []), ...inputPins(state, schemas)]]))
  const pathOfState = (name: string) => [...states.keys()].find((path) => path.split('/').at(-1) === name)
  const breaks = new Map<string, BreakNode>()
  const makes = new Map<string, MakeNode>()
  const edges = new Map<string, DataEdge>()
  const variables = resultVariables(definition)

  const wire = (from: { node: string; handle: string; type: PinType }, target: string, targetHandle: string) => {
    const id = `data:${from.node}|${from.handle}->${target}|${targetHandle}`
    edges.set(id, { id, source: from.node, sourceHandle: from.handle, target, targetHandle, type: from.type })
  }
  const pinOf = (pins: OutputPin[], path: string[]) => {
    let pin = pins.find((each) => samePath(each.path, path))
    if (!pin) {
      pin = { path, type: pinType(undefined) }
      pins.push(pin)
    }
    return pin
  }
  // The pin that gives the value at `path` of what `source` gives: its own, or a field of a Break of the object around it
  const from = (source: string, path: string[]): { node: string; handle: string; type: PinType } => {
    const pins = outputs.get(source)!
    const own = pins.find((pin) => samePath(pin.path, path))
    const fielded = pins.some((pin) => pin.path.length > 0)
    if (own || path.length === 0 || (fielded && path.length === 1)) {
      const pin = own ?? pinOf(pins, path)
      return { node: source, handle: outHandle(pin.path), type: pin.type }
    }
    const broken = breakOf(source, path.slice(0, -1))
    const pin = pinOf(broken.outputs, path.slice(-1))
    return { node: broken.id, handle: outHandle(pin.path), type: pin.type }
  }
  const breakOf = (source: string, path: string[]) => {
    const id = breakId(source, path)
    const known = breaks.get(id)
    if (known) return known
    const schema = givenSchema(definition, states.get(source), schemas, path)
    const made: BreakNode = { kind: 'break', id, source, path, type: pinType(schema), outputs: fieldsOf(schema).map(([key, field]) => ({ path: [key], type: pinType(field) })) }
    breaks.set(id, made)
    wire(from(source, path), id, breakIn)
    return made
  }
  const sourceOf = (value: unknown) => {
    const reference = parseReference(value)
    if (!reference) return
    if ('step' in reference.base) {
      const node = pathOfState(reference.base.step)
      return node === undefined || !outputs.has(node) ? undefined : from(node, [statusKey, ...reference.path])
    }
    const node = 'input' in reference.base ? triggerId : variables.get(reference.base.variable)
    return node === undefined || node === null || !outputs.has(node) ? undefined : from(node, reference.path)
  }
  const makeOf = (target: string, key: string) => {
    const id = makeId(target, key)
    const known = makes.get(id)
    if (known) return known
    const pin = inputs.get(target)?.find((each) => each.key === key)
    const state = states.get(target)!
    const schema = schemaAt(inputSchema(state, schemas), [key])
    const value = isObject(pin?.value) ? pin.value : {}
    const declared = fieldsOf(schema).map(([field, fieldSchema]) => inputPin(field, fieldSchema, value[field], false))
    const extra = Object.keys(value).filter((field) => !declared.some((each) => each.key === field)).map((field) => inputPin(field, schemaAt(schema, [field]) ?? {}, value[field], false))
    const made: MakeNode = { kind: 'make', id, target, key, type: pin?.type ?? pinType(schema), inputs: [...declared, ...extra] }
    makes.set(id, made)
    wire({ node: id, handle: makeOut, type: made.type }, target, inHandle(key))
    for (const field of made.inputs) {
      const source = sourceOf(field.value)
      if (source) wire(source, id, inHandle(field.key))
    }
    return made
  }

  for (const [target, pins] of inputs) {
    for (const pin of pins) {
      if (pin.state === 'made') makeOf(target, pin.key)
      if (pin.state !== 'wired') continue
      const source = sourceOf(pin.value)
      if (source) wire(source, target, inHandle(pin.key))
    }
  }
  for (const each of local) {
    if (each.kind === 'break' && outputs.has(each.source)) breakOf(each.source, each.path)
    if (each.kind === 'make' && inputs.get(each.target)?.some((pin) => pin.key === each.key)) makeOf(each.target, each.key)
  }
  return { inputs, outputs, pure: [...breaks.values(), ...makes.values()], edges: [...edges.values()] }
}

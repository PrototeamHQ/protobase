import {
  allStates,
  conditionParts,
  expressionReferences,
  expressionSource,
  inputSchema,
  isConditionPart,
  orderOf,
  parseReference,
  pinType,
  readText,
  referenceValue,
  resultRead,
  schemaAt,
  stepStatuses,
  type ConditionInput,
  type ConditionPart,
  type Definition,
  type PinSchemas,
  type PinType,
  type Reference,
  type State,
} from '@protobase/workflows'
import { pathOfName, triggerId } from '../definition'
import { conditionKey, conditionPin, fieldsOf, givenSchema, inputPin, inputPins, statusKey, statusPin, stepOutputs, triggerOutputs, type InputPin, type OutputPin } from './node-pins'
import { breakId, breakIn, conditionId, conditionOut, inHandle, makeId, makeOut, outHandle } from './pure-ids'

/** A Break node: the fields of the object a node gives at `path`, each a pin of its own. */
export type BreakNode = { kind: 'break'; id: string; source: string; path: string[]; type: PinType; outputs: OutputPin[] }

/** A Make node: the object a step's argument `key` holds, built from a pin per field. */
export type MakeNode = { kind: 'make'; id: string; target: string; key: string; type: PinType; inputs: InputPin[] }

/** A Condition no condition nodes stand for, whole: its JSONata, between `{%` and `%}`. */
export type ConditionExpression = { kind: 'expression'; source: string }

/**
 * A node of a step's Condition, on the way to its Only when pin in data order: a Comparison, an And, an Or or a Not at
 * `at` among the Condition's nodes, with an input per side, or the whole Condition as an Expression, with a pin per
 * value it reads.
 */
export type ConditionNode = { kind: 'condition'; id: string; target: string; at: number[]; part: ConditionPart | ConditionExpression; inputs: InputPin[] }

export type PureNode = BreakNode | MakeNode | ConditionNode

/**
 * A wire from an output pin to an input pin, of the type of the value it carries. `expression`: the input is an
 * expression that reads the value among others, so the wire shows the read, and only changing the expression removes it.
 */
export type DataEdge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string; type: PinType; expression?: true }

/** A Break or Make made on the canvas, which the document holds nothing for until a wire runs through it. */
export type LocalPure = { kind: 'break'; source: string; path: string[] } | { kind: 'make'; target: string; key: string }

/** The data side of the graph: every node's pins, the Break, Make and condition nodes, and the wires. */
export type DataGraph = { inputs: Map<string, InputPin[]>; outputs: Map<string, OutputPin[]>; pure: PureNode[]; edges: DataEdge[] }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, index) => key === b[index])

const booleanType: PinType = { kinds: ['boolean'] }

// The reads a Condition's nodes make, each once for each side that makes it
const partReads = (part: ConditionPart): Reference[] => (part.sides as ConditionInput[]).flatMap((side) => (isConditionPart(side) ? partReads(side) : 'read' in side ? [side.read] : []))

// A read of a step's Status, which the step's status pin gives
const readsStatus = (side: ConditionInput) => !isConditionPart(side) && 'read' in side && 'step' in side.read.base && samePath(side.read.path, ['Status'])

// The type of a value of a Comparison's own, by the type of what it is compared with, else by its own
const literalType = (value: unknown, other: PinType | undefined): PinType => {
  if (other && other.kinds !== 'any') {
    const kinds = other.kinds.filter((kind) => kind !== 'null')
    if (kinds.length === 1 && ['string', 'integer', 'number', 'boolean'].includes(kinds[0]!)) return { kinds }
  }
  return { kinds: [typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'] }
}

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
 * argument that is one read by name, through a Break node for each object a read goes into, a Make node for each
 * argument written as an object whose fields read values, and in data order each Condition as the condition nodes it
 * is made of, or else as an Expression node, with the Breaks and Makes of `local` besides.
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
  const conditions: ConditionNode[] = []
  const edges = new Map<string, DataEdge>()
  const variables = resultVariables(definition)

  const wire = (from: { node: string; handle: string; type: PinType }, target: string, targetHandle: string, expression = false) => {
    const id = `data:${from.node}|${from.handle}->${target}|${targetHandle}`
    if (expression && edges.has(id)) return
    edges.set(id, { id, source: from.node, sourceHandle: from.handle, target, targetHandle, type: from.type, ...(expression && { expression: true as const }) })
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
    // A step's status pin in data order is no field of what it gives: a step giving one whole value stays unfielded
    const fielded = pins.some((pin) => pin.path.length > 0 && pin.path[0] !== statusKey)
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
  // The wires of a value: one for a read by name alone, else one for each read of its expression
  const wireValue = (value: unknown, target: string, targetHandle: string) => {
    const one = sourceOf(value)
    if (one) return wire(one, target, targetHandle)
    for (const reference of expressionReferences(value)) {
      const source = sourceOfReference(reference)
      if (source) wire(source, target, targetHandle, true)
    }
  }
  const sourceOf = (value: unknown) => {
    const reference = parseReference(value)
    return reference && sourceOfReference(reference)
  }
  const sourceOfReference = (reference: Reference) => {
    if ('step' in reference.base) {
      const node = pathOfState(reference.base.step)
      return node === undefined || !outputs.has(node) ? undefined : from(node, [statusKey, ...reference.path])
    }
    const node = 'input' in reference.base ? triggerId : variables.get(reference.base.variable)
    return node === undefined || node === null || !outputs.has(node) ? undefined : from(node, reference.path)
  }
  // A read a condition node takes: a step's Status from its status pin, any other as a step's input takes it
  const sourceOfSide = (side: ConditionInput) => {
    if (isConditionPart(side) || !('read' in side)) return
    if (!readsStatus(side)) return sourceOfReference(side.read)
    const node = pathOfState((side.read.base as { step: string }).step)
    return node === undefined || !outputs.has(node) ? undefined : from(node, [statusKey])
  }
  // Each node of a Condition, its output wired to where it goes, and each side wired from its node or what it reads
  const partOf = (target: string, part: ConditionPart, at: number[], into: { node: string; handle: string }) => {
    const id = conditionId(target, at)
    const sides: ConditionInput[] = part.sides
    const sources = sides.map(sourceOfSide)
    const inputs = sides.map((side, index): InputPin => {
      const key = String(index)
      if (isConditionPart(side)) return { key, type: booleanType, required: false, value: undefined, state: 'made' }
      if ('read' in side) return { key, type: sources[index]?.type ?? pinType(undefined), required: false, value: referenceValue(side.read), state: 'wired' }
      // A Matches node's pattern is its own, written on the node; the text it tests is any text
      if ('pattern' in side) return { key, type: { kinds: ['string'] }, required: false, value: side.pattern, state: 'literal' }
      if (part.kind === 'matches') return { key, type: { kinds: ['string'] }, required: false, value: side.value, state: 'literal' }
      if (part.kind !== 'compare') return { key, type: booleanType, required: false, value: side.value, state: 'literal' }
      // A value compared with a step's Status is one of the statuses it can be
      const other = sides[1 - index]!
      if (readsStatus(other)) return { key, type: { kinds: ['string'] }, required: false, value: side.value, state: 'literal', options: stepStatuses, statuses: true }
      return { key, type: literalType(side.value, sources[1 - index]?.type), required: false, value: side.value, state: 'literal' }
    })
    // An All of or an Any of has one input more, empty, which a wire or a node adds as its next condition
    if (part.kind === 'logic') inputs.push({ key: String(sides.length), type: booleanType, required: false, value: undefined, state: 'empty' })
    conditions.push({ kind: 'condition', id, target, at, part, inputs })
    wire({ node: id, handle: conditionOut, type: booleanType }, into.node, into.handle)
    sides.forEach((side, index) => {
      if (isConditionPart(side)) partOf(target, side, [...at, index], { node: id, handle: inHandle(String(index)) })
      else if (sources[index]) wire(sources[index], id, inHandle(String(index)))
    })
  }
  // A step's Condition as its condition nodes when it is made of them and each read has a pin to come from, else as an
  // Expression node with a pin per value it reads
  const conditionOf = (target: string, value: unknown) => {
    const part = conditionParts(value)
    const into = { node: target, handle: inHandle(conditionKey) }
    if (part && partReads(part).every((read) => sourceOfSide({ read }))) return partOf(target, part, [], into)
    const id = conditionId(target, [])
    const reads = expressionReferences(value).flatMap((read) => {
      const source = sourceOfSide({ read })
      return source ? [{ read, source }] : []
    })
    conditions.push({ kind: 'condition', id, target, at: [], part: { kind: 'expression', source: expressionSource(value)! }, inputs: reads.map(({ read, source }) => ({ key: readText(read), type: source.type, required: false, value: referenceValue(read), state: 'wired' })) })
    wire({ node: id, handle: conditionOut, type: booleanType }, into.node, into.handle)
    for (const { read, source } of reads) wire(source, id, inHandle(readText(read)), true)
  }
  const makeOf = (target: string, key: string) => {
    const id = makeId(target, key)
    const known = makes.get(id)
    if (known) return known
    const pin = inputs.get(target)?.find((each) => each.key === key)
    const state = states.get(target)!
    const schema = schemaAt(inputSchema(state, schemas), [key])
    const value = isObject(pin?.value) ? pin.value : {}
    const required = new Set(Array.isArray(schema?.required) ? (schema.required as string[]) : [])
    const declared = fieldsOf(schema).map(([field, fieldSchema]) => inputPin(field, fieldSchema, value[field], required.has(field)))
    const extra = Object.keys(value).filter((field) => !declared.some((each) => each.key === field)).map((field) => inputPin(field, schemaAt(schema, [field]) ?? {}, value[field], false))
    const made: MakeNode = { kind: 'make', id, target, key, type: pin?.type ?? pinType(schema), inputs: [...declared, ...extra] }
    makes.set(id, made)
    wire({ node: id, handle: makeOut, type: made.type }, target, inHandle(key))
    for (const field of made.inputs) wireValue(field.value, id, inHandle(field.key))
    return made
  }

  for (const [target, pins] of inputs) {
    for (const [index, pin] of pins.entries()) {
      // A Condition that computes is drawn by its nodes, which build it as a Make builds an object
      if (pin.key === conditionKey && pin.state === 'expression') {
        pins[index] = { ...pin, state: 'made' }
        conditionOf(target, pin.value)
        continue
      }
      if (pin.state === 'made') makeOf(target, pin.key)
      if (pin.state === 'wired' || pin.state === 'expression') wireValue(pin.value, target, inHandle(pin.key))
    }
  }
  for (const each of local) {
    if (each.kind === 'break' && outputs.has(each.source)) breakOf(each.source, each.path)
    // A Make made on the canvas stays only while its input holds no read or expression, which a wire would have put there
    if (each.kind === 'make' && inputs.get(each.target)?.some((pin) => pin.key === each.key && pin.state !== 'wired' && pin.state !== 'expression')) makeOf(each.target, each.key)
  }
  return { inputs, outputs, pure: [...breaks.values(), ...makes.values(), ...conditions], edges: [...edges.values()] }
}

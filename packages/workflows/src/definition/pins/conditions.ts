import { expressionSource, parse } from '../expressions'
import { readText, type Reference } from './references'

/** A Comparison's operator, as JSONata writes it: Equals, Not equals, Greater and Less. */
export type CompareOp = '=' | '!=' | '>' | '<'

/** A value a condition node takes: one read by name, or a value of its own. */
export type ConditionOperand = { read: Reference } | { value: string | number | boolean }

/**
 * A Condition taken apart into the editor's nodes: a Comparison of two values, an And or an Or of two conditions, or a
 * Not of one, where a condition is another of these or a value of its own or read by name.
 */
export type ConditionPart =
  | { kind: 'compare'; op: CompareOp; sides: [ConditionOperand, ConditionOperand] }
  | { kind: 'logic'; op: 'and' | 'or'; sides: [ConditionSide, ConditionSide] }
  | { kind: 'not'; sides: [ConditionSide] }

/** What a condition node's input takes: a node of its own, or a value. */
export type ConditionSide = ConditionPart | ConditionOperand

/** What a step's status can be, as `$states.context.Steps.<name>.Status` reads it. */
export const stepStatuses = ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED', 'SKIPPED'] as const

const compareOps: readonly string[] = ['=', '!=', '>', '<']

/** Whether a side is a node of its own rather than a value. */
export const isConditionPart = (side: ConditionSide): side is ConditionPart => 'kind' in side

type Node = { type: string; value?: unknown; steps?: Node[]; lhs?: Node; rhs?: Node; expressions?: Node[]; arguments?: Node[]; procedure?: Node; [key: string]: unknown }

// A step of a path read by name, which says nothing but its name
const plainStep = (step: Node) => Object.keys(step).every((key) => key === 'type' || key === 'value' || key === 'position')

// The read a path or a variable is, as references read them: the run's input, a step's status or a variable
const referenceOf = (node: Node): Reference | undefined => {
  if (node.type === 'variable' && plainStep(node) && typeof node.value === 'string' && node.value !== '' && node.value !== 'states') return { base: { variable: node.value }, path: [] }
  if (node.type !== 'path' || !node.steps || !node.steps.every(plainStep)) return
  const [first, ...rest] = node.steps
  if (first?.type !== 'variable' || typeof first.value !== 'string' || !rest.every((step) => step.type === 'name' && typeof step.value === 'string')) return
  const names = rest.map((step) => step.value as string)
  if (first.value !== 'states') return first.value === '' ? undefined : { base: { variable: first.value }, path: names }
  if (names[0] === 'context' && names[1] === 'Steps' && names.length > 2) return { base: { step: names[2]! }, path: names.slice(3) }
  if (names[0] === 'context' && names[1] === 'Execution' && names[2] === 'Input') return { base: { input: true }, path: names.slice(3) }
  return
}

const operandOf = (node: Node): ConditionOperand | undefined => {
  if (node.type === 'string' || node.type === 'number' || (node.type === 'value' && typeof node.value === 'boolean')) return { value: node.value as string | number | boolean }
  const read = referenceOf(node)
  return read && { read }
}

const partOf = (node: Node): ConditionPart | undefined => {
  if (node.type === 'block' && node.expressions?.length === 1) return partOf(node.expressions[0]!)
  if (node.type === 'binary' && (node.value === 'and' || node.value === 'or')) {
    const [lhs, rhs] = [sideOf(node.lhs!), sideOf(node.rhs!)]
    return lhs && rhs && { kind: 'logic', op: node.value, sides: [lhs, rhs] }
  }
  if (node.type === 'binary' && compareOps.includes(node.value as string)) {
    const [lhs, rhs] = [operandOf(node.lhs!), operandOf(node.rhs!)]
    return lhs && rhs && { kind: 'compare', op: node.value as CompareOp, sides: [lhs, rhs] }
  }
  if (node.type === 'function' && node.procedure?.type === 'variable' && node.procedure.value === 'not' && node.arguments?.length === 1) {
    const side = sideOf(node.arguments[0]!)
    return side && { kind: 'not', sides: [side] }
  }
  return
}

// An And's, an Or's or a Not's input: a node of its own, true or false, or a read
const sideOf = (node: Node): ConditionSide | undefined => {
  const part = partOf(node)
  if (part) return part
  const operand = operandOf(node)
  return operand && ('read' in operand || typeof operand.value === 'boolean') ? operand : undefined
}

// Text JSONata reads as it is between single quotes, which it has no escape for; any other in double quotes, as JSON writes it
const quoted = (value: string) => (/^[^'\\\x00-\x1f]*$/.test(value) ? `'${value}'` : JSON.stringify(value))

const operandText = (operand: ConditionOperand) => {
  if ('read' in operand) return readText(operand.read)
  return typeof operand.value === 'string' ? quoted(operand.value) : String(operand.value)
}

// JSONata binds a comparison closer than And, and And closer than Or; each takes its left side first
const sideText = (side: ConditionSide, parent: 'and' | 'or', right: boolean) => {
  if (!isConditionPart(side)) return operandText(side)
  const text = partText(side)
  if (side.kind !== 'logic') return text
  const looser = parent === 'and' && side.op === 'or'
  return looser || (right && side.op === parent) ? `(${text})` : text
}

const partText = (part: ConditionPart): string => {
  if (part.kind === 'compare') return `${operandText(part.sides[0])} ${part.op} ${operandText(part.sides[1])}`
  if (part.kind === 'logic') return `${sideText(part.sides[0], part.op, false)} ${part.op} ${sideText(part.sides[1], part.op, true)}`
  const [side] = part.sides
  return `$not(${isConditionPart(side) ? partText(side) : operandText(side)})`
}

/** The Condition a node and what it takes write: `{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}`. */
export const conditionValue = (part: ConditionPart) => `{% ${partText(part)} %}`

/**
 * A Condition taken apart into nodes, when it is a Comparison, an And, an Or or a Not of values and reads by name and
 * writing those nodes back gives it exactly as it is; undefined for any other, such as one that computes, or is spaced
 * or bracketed otherwise, which stays an expression, so no Condition is ever rewritten.
 */
export const conditionParts = (value: unknown): ConditionPart | undefined => {
  const source = expressionSource(value)
  if (source === undefined) return
  const parsed = parse(source)
  if ('error' in parsed) return
  const part = partOf(parsed.expression.ast() as Node)
  return part && conditionValue(part) === value ? part : undefined
}

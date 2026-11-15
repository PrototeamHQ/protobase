import { conditionParts, conditionValue, isConditionPart, type CompareOp, type ConditionOperand, type ConditionPart, type ConditionSide, type Definition } from '@protobase/workflows'
import { stateAt } from '../definition'
import { setArgument } from './argument-edits'
import { conditionKey } from './node-pins'

/** A condition node the canvas offers to add: a Comparison by its operator, an And, an Or, a Not or an Expression. */
export type ConditionChoice = CompareOp | 'and' | 'or' | 'not' | 'expression'

/** The choices offered for a step's Only when pin, and for a side of an And, an Or or a Not, which takes no Expression. */
export const conditionChoices = (root: boolean): ConditionChoice[] => ['=', '!=', '>', '<', 'and', 'or', 'not', ...(root ? ['expression' as const] : [])]

/** What a side holds once nothing is wired to it: an empty value to compare, or what leaves an And or an Or as the other side says. */
export const emptySide = (part: ConditionPart): ConditionOperand => (part.kind === 'compare' ? { value: '' } : { value: part.kind === 'logic' && part.op === 'and' })

/** A new condition node, each side holding what it holds with nothing wired to it. */
export const newPart = (choice: Exclude<ConditionChoice, 'expression'>): ConditionPart => {
  if (choice === 'not') return { kind: 'not', sides: [{ value: false }] }
  if (choice === 'and' || choice === 'or') return { kind: 'logic', op: choice, sides: [{ value: choice === 'and' }, { value: choice === 'and' }] }
  return { kind: 'compare', op: choice, sides: [{ value: '' }, { value: '' }] }
}

// The Condition a new Expression node holds, which the step runs under as before it had one
const newExpression = '{% true %}'

// The node at `at` of a Condition's nodes, which `at` names by the side each holds it at
const partAt = (part: ConditionPart, at: readonly number[]): ConditionPart | undefined => {
  if (at.length === 0) return part
  const side = part.sides[at[0]!]
  return side && isConditionPart(side) ? partAt(side, at.slice(1)) : undefined
}

// The nodes with the side at `at` holding `side`, or undefined when no node has that side
const withSide = (part: ConditionPart, at: readonly number[], side: ConditionSide): ConditionPart | undefined => {
  const [index, ...rest] = at
  if (index === undefined || index >= part.sides.length) return
  const held = part.sides[index]!
  const next = rest.length === 0 ? side : isConditionPart(held) ? withSide(held, rest, side) : undefined
  if (!next) return
  const sides = part.sides.map((each, position) => (position === index ? next : each))
  return { ...part, sides } as ConditionPart
}

/**
 * The definition with the side at `at` of the Condition of the step at `step` holding `side`, as the Condition is now,
 * so edits made one after another each see the last; as it was when the Condition is no longer made of nodes there.
 */
export const setConditionSide = (definition: Definition, step: string, at: readonly number[], side: ConditionSide): Definition => {
  const root = conditionParts(stateAt(definition, step)?.Condition)
  const next = root && withSide(root, at, side)
  return next ? setArgument(definition, step, [conditionKey], conditionValue(next)) : definition
}

/**
 * The definition with a new condition node chosen for the side at `at` of the Condition of the step at `step`, or for
 * its Only when pin with `[]`, where an Expression may be chosen too.
 */
export const addCondition = (definition: Definition, step: string, at: readonly number[], choice: ConditionChoice): Definition => {
  if (at.length === 0) return setArgument(definition, step, [conditionKey], choice === 'expression' ? newExpression : conditionValue(newPart(choice)))
  return choice === 'expression' ? definition : setConditionSide(definition, step, at, newPart(choice))
}

/** The definition with the side at `at` holding nothing, and the node there removed with all it takes; the whole Condition for `[]`. */
export const clearConditionSide = (definition: Definition, step: string, at: readonly number[]): Definition => {
  if (at.length === 0) return setArgument(definition, step, [conditionKey], undefined)
  const root = conditionParts(stateAt(definition, step)?.Condition)
  const parent = root && partAt(root, at.slice(0, -1))
  return parent ? setConditionSide(definition, step, at, emptySide(parent)) : definition
}

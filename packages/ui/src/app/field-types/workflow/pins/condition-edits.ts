import { conditionParts, conditionValue, isConditionPart, type CompareOp, type ConditionInput, type ConditionOperand, type ConditionPart, type ConditionSide, type Definition } from '@protobase/workflows'
import { stateAt } from '../definition'
import { setArgument } from './argument-edits'
import { conditionKey } from './node-pins'

/** A condition node the canvas offers to add: a Comparison by its operator, a Matches, an All of, an Any of, a Not or an Expression. */
export type ConditionChoice = CompareOp | 'matches' | 'and' | 'or' | 'not' | 'expression'

/** The choices offered for a step's Only when pin, and for an input of an All of, an Any of or a Not, which takes no Expression. */
export const conditionChoices = (root: boolean): ConditionChoice[] => ['=', '!=', '>', '<', 'matches', 'and', 'or', 'not', ...(root ? ['expression' as const] : [])]

/**
 * What an input holds once nothing is wired to it: an empty text to compare or test, or what leaves an All of or an
 * Any of as its other inputs say.
 */
export const emptySide = (part: ConditionPart): ConditionOperand => (part.kind === 'compare' || part.kind === 'matches' ? { value: '' } : { value: part.kind === 'logic' && part.op === 'and' })

/** A new condition node, each input holding what it holds with nothing wired to it, a Matches node any text. */
export const newPart = (choice: Exclude<ConditionChoice, 'expression'>): ConditionPart => {
  if (choice === 'not') return { kind: 'not', sides: [{ value: false }] }
  if (choice === 'and' || choice === 'or') return { kind: 'logic', op: choice, sides: [{ value: choice === 'and' }, { value: choice === 'and' }] }
  if (choice === 'matches') return { kind: 'matches', sides: [{ value: '' }, { pattern: '.*', flags: '' }] }
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

const withInput = (part: ConditionPart, index: number, input: ConditionInput) => ({ ...part, sides: (part.sides as ConditionInput[]).map((each, position) => (position === index ? input : each)) }) as ConditionPart

// The nodes with the node at `at` changed by `change`, or undefined when no node is there or the change has no place
const withPart = (part: ConditionPart, at: readonly number[], change: (part: ConditionPart) => ConditionPart | undefined): ConditionPart | undefined => {
  if (at.length === 0) return change(part)
  const held = part.sides[at[0]!]
  const next = held && isConditionPart(held) ? withPart(held, at.slice(1), change) : undefined
  return next && withInput(part, at[0]!, next)
}

// A node with its input `index` holding `side`: an All of or an Any of takes one more after its last; a Matches node's
// pattern takes text, any text when it is empty; a Comparison and the text of a Matches take no node
const putSide = (part: ConditionPart, index: number, side: ConditionSide): ConditionPart | undefined => {
  if (part.kind === 'logic' && index === part.sides.length) return { ...part, sides: [...part.sides, side] }
  if (index >= part.sides.length) return
  if (part.kind === 'matches' && index === 1) return !isConditionPart(side) && 'value' in side && typeof side.value === 'string' ? withInput(part, 1, { pattern: side.value || '.*', flags: part.sides[1].flags }) : undefined
  if ((part.kind === 'compare' || part.kind === 'matches') && isConditionPart(side)) return
  return withInput(part, index, side)
}

/**
 * The definition with the side at `at` of the Condition of the step at `step` holding `side`, as the Condition is now,
 * so edits made one after another each see the last; as it was when the Condition is no longer made of nodes there.
 */
export const setConditionSide = (definition: Definition, step: string, at: readonly number[], side: ConditionSide): Definition => {
  const root = conditionParts(stateAt(definition, step)?.Condition)
  const next = root && at.length > 0 && withPart(root, at.slice(0, -1), (parent) => putSide(parent, at.at(-1)!, side))
  return next ? setArgument(definition, step, [conditionKey], conditionValue(next)) : definition
}

/**
 * The definition with a new condition node chosen for the side at `at` of the Condition of the step at `step`, or for
 * its Only when pin with `[]`, where an Expression may be chosen too. Only where the offer still stands, as the
 * Condition is now: an empty Only when pin, an input of an All of, an Any of or a Not that holds a value, or the empty
 * one after an All of's or an Any of's last; else as it was.
 */
export const addCondition = (definition: Definition, step: string, at: readonly number[], choice: ConditionChoice): Definition => {
  const condition = stateAt(definition, step)?.Condition
  if (at.length === 0) {
    if (condition !== undefined && condition !== '') return definition
    return setArgument(definition, step, [conditionKey], choice === 'expression' ? newExpression : conditionValue(newPart(choice)))
  }
  const root = conditionParts(condition)
  const parent = root && partAt(root, at.slice(0, -1))
  const index = at.at(-1)!
  const held: ConditionInput | undefined = parent?.sides[index]
  const open = parent?.kind === 'logic' && index === parent.sides.length
  if (choice === 'expression' || !parent || parent.kind === 'compare' || parent.kind === 'matches' || (!open && (!held || isConditionPart(held) || !('value' in held)))) return definition
  return setConditionSide(definition, step, at, newPart(choice))
}

/**
 * The definition with the input at `at` holding nothing, and the node there removed with all it takes: an All of or an
 * Any of of more than two loses that input; the whole Condition for `[]`.
 */
export const clearConditionSide = (definition: Definition, step: string, at: readonly number[]): Definition => {
  if (at.length === 0) return setArgument(definition, step, [conditionKey], undefined)
  const root = conditionParts(stateAt(definition, step)?.Condition)
  const index = at.at(-1)!
  const next =
    root &&
    withPart(root, at.slice(0, -1), (parent) => {
      if (index >= parent.sides.length) return
      if (parent.kind === 'logic' && parent.sides.length > 2) return { ...parent, sides: parent.sides.filter((_, position) => position !== index) }
      return putSide(parent, index, emptySide(parent))
    })
  return next ? setArgument(definition, step, [conditionKey], conditionValue(next)) : definition
}

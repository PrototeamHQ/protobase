import { selectValue, type Definition, type SelectValue } from '@protobase/workflows'
import { stateAt } from '../definition'
import { setArgument } from './argument-edits'

const isSelectValue = (value: unknown): value is SelectValue => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/**
 * The definition with a Select chosen for the argument `key` of the step at `step`: one case, which gives the value the
 * argument held, as it gives otherwise, so the step does as before until the node is filled in. Only while the
 * argument holds no read or expression, as the offer was made; else as it was.
 */
export const addSelect = (definition: Definition, step: string, key: string): Definition => {
  const args = (stateAt(definition, step) as { Arguments?: Record<string, unknown> } | undefined)?.Arguments
  const held = args?.[key]
  if (held !== undefined && !isSelectValue(held)) return definition
  if (typeof held === 'string' && held.startsWith('{%')) return definition
  const value = held ?? ''
  return setArgument(definition, step, [key], selectValue({ operand: { value: '' }, cases: [{ when: '', then: value }], otherwise: value }))
}

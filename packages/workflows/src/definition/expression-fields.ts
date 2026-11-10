import { templateExpressions } from './expressions'
import { fieldPath } from './problem'
import type { State } from './types'

/** Which `$states` field an expression may read where it is: the Task's, Map's or Block's result, a caught error. */
export type ExpressionPlace = 'state' | 'result' | 'error'

/** Every expression of a state, with its field and the place it is evaluated in. */
export const stateExpressions = (state: State) => {
  const found: { field: string; source: string; place: ExpressionPlace }[] = []
  const add = (value: unknown, base: (string | number)[], place: ExpressionPlace) => {
    for (const { path, source } of templateExpressions(value, base)) found.push({ field: fieldPath(path), source, place })
  }
  // A Task or Map shapes its result with Output and Assign; the other states have no result.
  const after: ExpressionPlace = state.Type === 'Task' || state.Type === 'Map' || state.Type === 'Block' ? 'result' : 'state'
  if (state.Type === 'Fail') {
    add(state.Error, ['Error'], 'state')
    add(state.Cause, ['Cause'], 'state')
    return found
  }
  add(state.Output, ['Output'], after)
  if ('Assign' in state) add(state.Assign, ['Assign'], after)
  if (state.Type === 'Task') add(state.Arguments, ['Arguments'], 'state')
  if (state.Type === 'Map') add(state.Items, ['Items'], 'state')
  if (state.Type === 'Block') {
    add(state.Arguments, ['Arguments'], 'state')
    add(state.Cache.Key, ['Cache', 'Key'], 'state')
  }
  if (state.Type === 'Wait') {
    add(state.Seconds, ['Seconds'], 'state')
    add(state.Timestamp, ['Timestamp'], 'state')
  }
  if (state.Type === 'Choice') {
    state.Choices.forEach((rule, index) => {
      add(rule.Condition, ['Choices', index, 'Condition'], 'state')
      add(rule.Output, ['Choices', index, 'Output'], 'state')
      add(rule.Assign, ['Choices', index, 'Assign'], 'state')
    })
  }
  if ('Catch' in state) {
    state.Catch?.forEach((catcher, index) => {
      add(catcher.Output, ['Catch', index, 'Output'], 'error')
      add(catcher.Assign, ['Catch', index, 'Assign'], 'error')
    })
  }
  return found
}

/** The variables a state assigns, in its own Assign, its choice rules' and its catchers'. */
export const assignedNames = (state: State) => {
  const names: string[] = []
  if ('Assign' in state && state.Assign) names.push(...Object.keys(state.Assign))
  if (state.Type === 'Choice') for (const rule of state.Choices) names.push(...Object.keys(rule.Assign ?? {}))
  if ('Catch' in state) for (const catcher of state.Catch ?? []) names.push(...Object.keys(catcher.Assign ?? {}))
  return names
}

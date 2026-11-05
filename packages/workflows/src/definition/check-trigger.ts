import type { Problem } from './problem'
import type { Trigger } from './types'

/** Checks a trigger type's input: each problem's field is relative to the input, such as `cron`. */
export type TriggerCheck = (input: Record<string, unknown>) => { field?: string; message: string }[]

/**
 * What the schema cannot check of a trigger: that its type is one the app has and can run, `unavailable` holding why
 * it cannot by type, and its input against that type.
 */
export const triggerProblems = (trigger: Trigger, triggers: Readonly<Record<string, TriggerCheck>>, unavailable: Readonly<Record<string, string>> = {}): Problem[] => {
  const [type, input] = Object.entries(trigger)[0]!
  if (type === 'manual') return Object.keys(input).length === 0 ? [] : [{ field: 'trigger.manual', message: 'takes no input' }]
  if (Object.hasOwn(unavailable, type)) return [{ field: 'trigger', message: `"${type}" cannot run in this app: ${unavailable[type]}` }]
  const check = triggers[type]
  if (!check) return [{ field: 'trigger', message: `"${type}" is not a trigger type; use manual or one of ${Object.keys(triggers).join(', ')}` }]
  return check(input).map((problem) => ({ field: `trigger.${type}${problem.field ? `.${problem.field}` : ''}`, message: problem.message }))
}

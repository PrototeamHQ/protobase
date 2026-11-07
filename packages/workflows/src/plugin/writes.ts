import type { StepType } from './types'

/** Whether a call of `type` with `input` writes: only a declared `false`, or a function that gives `false`, reads. */
export const writesFor = (type: Pick<StepType, 'writes'>, input: Record<string, unknown>) => {
  if (typeof type.writes !== 'function') return type.writes !== false
  try {
    return type.writes(input) !== false
  } catch {
    // A replay calls no step it cannot tell reads: the error only means it writes.
    return true
  }
}

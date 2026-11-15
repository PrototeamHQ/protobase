import { limits } from '../limits'
import { nestingDepth } from '../nesting'
import type { Problem } from './problem'

/** The problem of a definition, or a state machine, nesting past `limits.definitionDepth`, found without recursion; empty within it. */
export const depthProblems = (value: unknown): Problem[] => {
  if (nestingDepth(value, limits.definitionDepth) <= limits.definitionDepth) return []
  return [{ message: `The definition nests more than ${limits.definitionDepth} levels of arrays and objects` }]
}

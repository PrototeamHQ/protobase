import type { NodeProblem } from './problems'

/** What the check says about `field` of a state, or about a field within it (`Arguments` takes `Arguments.url`'s), as one line. */
export const errorAt = (problems: readonly NodeProblem[], field: string) => {
  const found = problems.filter((problem) => problem.field === field || problem.field?.startsWith(`${field}.`) || problem.field?.startsWith(`${field}[`))
  return found.length > 0 ? found.map((problem) => problem.message).join('; ') : undefined
}

import type { Expression } from 'jsonata'

type Node = { type: string; value?: unknown; [key: string]: unknown }

/** What an expression reads: each `$name` it does not bind itself, `$states.<field>` by field, and reads of its input. */
export type Reads = {
  variables: Set<string>
  /** `input`, `result`, `errorOutput`, `context`, or `''` for `$states` on its own. */
  states: Set<string>
  /** A read of the evaluation's input (`$`, `$$`, a bare field name, `*`, `**` or `%`), which the profile refuses. */
  input: boolean
}

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

// Steps of a path after the first, and a step's filters, sorts and groups, are read relative to that step.
const relativeKeys = new Set(['stages', 'predicate', 'group', 'terms'])
const inputReads = new Set(['name', 'wildcard', 'descendant', 'parent'])

/** JSONata's own functions, which an expression calls as `$sum(...)`: no reads of a variable. */
export const builtInFunctions = new Set(
  ('sum count max min average string substring substringBefore substringAfter lowercase uppercase length trim pad match contains replace split join ' +
    'formatNumber formatBase formatInteger parseInteger number floor ceil round abs sqrt power random boolean not map zip filter single reduce sift keys ' +
    'lookup append exists spread merge reverse each error assert type sort shuffle distinct base64encode base64decode encodeUrlComponent encodeUrl ' +
    'decodeUrlComponent decodeUrl eval toMillis fromMillis clone now millis').split(' '),
)

/** The reads of a compiled expression, from its syntax tree. */
export const expressionReads = (expression: Expression): Reads => {
  const bound = new Set<string>()
  const variables = new Set<string>()
  const states = new Set<string>()
  let input = false
  // `$states` as the first step of a path, which the path reports with its field.
  const inPath = new WeakSet<Node>()

  const visit = (value: unknown, rooted: boolean): void => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, rooted))
    if (!isNode(value)) return
    if (value.type === 'bind' && isNode(value.lhs) && value.lhs.type === 'variable') bound.add(String(value.lhs.value))
    if (value.type === 'lambda' && Array.isArray(value.arguments)) for (const argument of value.arguments as Node[]) bound.add(String(argument.value))
    if (value.type === 'variable') {
      const name = String(value.value)
      if (name === '' || name === '$') input ||= rooted
      else variables.add(name)
    }
    if (inputReads.has(value.type) && rooted) input = true
    if (value.type === 'path' && Array.isArray(value.steps)) {
      const [first, second] = value.steps as Node[]
      if (first?.type === 'variable' && first.value === 'states') {
        inPath.add(first)
        states.add(second?.type === 'name' ? String(second.value) : '')
      }
      ;(value.steps as Node[]).forEach((step, index) => visit(step, index === 0 ? rooted : false))
    } else if (value.type === 'variable' && value.value === 'states' && !inPath.has(value)) {
      states.add('')
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'steps' && value.type === 'path') continue
      if (key === 'position' || key === 'value' || key === 'type') continue
      visit(child, relativeKeys.has(key) || value.type === 'filter' || value.type === 'sort' ? false : rooted)
    }
  }

  visit(expression.ast(), true)
  for (const name of [...bound, ...builtInFunctions]) variables.delete(name)
  // `$states` is reported under `states`, by the field it reads.
  variables.delete('states')
  return { variables, states, input }
}

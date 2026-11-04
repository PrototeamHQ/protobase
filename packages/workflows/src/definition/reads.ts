import type { Expression } from 'jsonata'

type Node = { type: string; value?: unknown; [key: string]: unknown }

/** What an expression reads: each `$name` it does not bind itself, `$states.<field>` by field, and reads of its input. */
export type Reads = {
  variables: Set<string>
  /**
   * Each read of `$states` as the field names that follow it, up to the first step that is not a name: `['input']`,
   * `['context', 'Execution', 'Input', 'total']`, or `[]` for `$states` on its own.
   */
  states: string[][]
  /** A read of the evaluation's input (`$`, `$$`, a bare field name, `*`, `**` or `%`), which the profile refuses. */
  input: boolean
  /** A read of JSONata's `$eval`, called or passed on as a value: what it evaluates is read nowhere the check sees. */
  evaluates: boolean
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

const opensScope = (value: unknown) => isNode(value) && (value.type === 'block' || value.type === 'lambda')

// The names a block or a function binds with `:=` itself, anywhere in it but in the blocks and functions inside it, which
// bind their own. A name is bound in all its block, so a function in it may call itself.
const boundIn = (value: unknown, names = new Set<string>(), root = true): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) boundIn(item, names, false)
    return names
  }
  if (!isNode(value) || (!root && opensScope(value))) return names
  if (value.type === 'bind' && isNode(value.lhs) && value.lhs.type === 'variable') names.add(String(value.lhs.value))
  for (const [key, child] of Object.entries(value)) if (key !== 'position' && key !== 'value' && key !== 'type') boundIn(child, names, false)
  return names
}

/** The reads of a compiled expression, from its syntax tree, each name read where it is bound counted as no read. */
export const expressionReads = (expression: Expression): Reads => {
  const variables = new Set<string>()
  const states: string[][] = []
  let input = false
  // `$states` as the first step of a path, which the path reports with its field.
  const inPath = new WeakSet<Node>()

  const visit = (value: unknown, rooted: boolean, outer: ReadonlySet<string>): void => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, rooted, outer))
    if (!isNode(value)) return
    let bound = outer
    if (opensScope(value)) {
      const parameters = value.type === 'lambda' && Array.isArray(value.arguments) ? (value.arguments as Node[]).map((argument) => String(argument.value)) : []
      bound = new Set([...outer, ...parameters, ...boundIn(value)])
    }
    if (value.type === 'variable') {
      const name = String(value.value)
      if (name === '' || name === '$') input ||= rooted
      else if (!bound.has(name)) variables.add(name)
    }
    if (inputReads.has(value.type) && rooted) input = true
    if (value.type === 'path' && Array.isArray(value.steps)) {
      const [first] = value.steps as Node[]
      if (first?.type === 'variable' && first.value === 'states') {
        inPath.add(first)
        const rest = (value.steps as Node[]).slice(1)
        const end = rest.findIndex((step) => step.type !== 'name' || step.stages !== undefined || step.predicate !== undefined)
        states.push(rest.slice(0, end === -1 ? rest.length : end + (rest[end]?.type === 'name' ? 1 : 0)).map((step) => String(step.value)))
      }
      ;(value.steps as Node[]).forEach((step, index) => visit(step, index === 0 ? rooted : false, bound))
    } else if (value.type === 'variable' && value.value === 'states' && !inPath.has(value)) {
      states.push([])
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'steps' && value.type === 'path') continue
      if (key === 'position' || key === 'value' || key === 'type') continue
      visit(child, relativeKeys.has(key) || value.type === 'filter' || value.type === 'sort' ? false : rooted, bound)
    }
  }

  const ast = expression.ast()
  visit(ast, true, boundIn(ast))
  const evaluates = variables.has('eval')
  for (const name of builtInFunctions) variables.delete(name)
  // `$states` is reported under `states`, by the field it reads.
  variables.delete('states')
  return { variables, states, input, evaluates }
}

import { expressionSource, parse } from '../expressions'
import { expressionReads } from '../reads'

/** Where a read starts: the run's input, a variable a state assigns, or in data order a state's status by its name. */
export type ReadBase = { input: true } | { variable: string } | { step: string }

/** A value that is one read by name and nothing else: where it starts, and the fields it goes down. */
export type Reference = { base: ReadBase; path: string[] }

const inputRead = '$states.context.Execution.Input'
const stepsRead = '$states.context.Steps'
const plainKey = /^[A-Za-z_][A-Za-z0-9_]*$/
const segment = /^\.(?:([A-Za-z_][A-Za-z0-9_]*)|`([^`]+)`)/

const pathOf = (rest: string): string[] | undefined => {
  const path: string[] = []
  let left = rest
  while (left !== '') {
    const match = segment.exec(left)
    if (!match) return
    path.push(match[1] ?? match[2]!)
    left = left.slice(match[0].length)
  }
  return path
}

/**
 * The read a value is, when it is an expression of one read by name, such as `{% $fetch.body.ip %}` or
 * `{% $states.context.Execution.Input.record.name %}`; undefined for any other value, such as text, an expression that
 * computes, or `$states.result`.
 */
export const parseReference = (value: unknown): Reference | undefined => {
  const source = expressionSource(value)?.trim()
  if (source === undefined) return
  if (source === inputRead || source.startsWith(`${inputRead}.`)) {
    const path = pathOf(source.slice(inputRead.length))
    return path && { base: { input: true }, path }
  }
  if (source.startsWith(`${stepsRead}.`)) {
    const path = pathOf(source.slice(stepsRead.length))
    return path && path.length > 0 ? { base: { step: path[0]! }, path: path.slice(1) } : undefined
  }
  const variable = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(source)
  if (!variable || variable[1] === 'states') return
  const path = pathOf(source.slice(variable[0].length))
  return path && { base: { variable: variable[1]! }, path }
}

const keyText = (key: string) => (plainKey.test(key) ? key : `\`${key}\``)

/** The JSONata read of a reference, such as `$fetch.body.ip`. */
export const readText = ({ base, path }: Reference) => ['input' in base ? inputRead : 'step' in base ? `${stepsRead}.${keyText(base.step)}` : `$${base.variable}`, ...path.map(keyText)].join('.')

/** A reference as the value of a field: `{% <read> %}`. */
export const referenceValue = (reference: Reference) => `{% ${readText(reference)} %}`

type Node = { type: string; value?: unknown; steps?: Node[]; stages?: unknown; predicate?: unknown; [key: string]: unknown }

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

// The names a path's steps after its first go down, up to the first that is not a plain name
const namesAfter = (steps: Node[]) => {
  const names: string[] = []
  for (const step of steps) {
    if (step.type !== 'name' || step.stages !== undefined || step.predicate !== undefined) break
    names.push(String(step.value))
  }
  return names
}

// A read that starts at `$states`: the run's input, or in data order a state's status by its name
const statesReference = (names: string[]): Reference | undefined => {
  if (names[0] !== 'context') return
  if (names[1] === 'Execution' && names[2] === 'Input') return { base: { input: true }, path: names.slice(3) }
  if (names[1] === 'Steps' && names[2] !== undefined) return { base: { step: names[2] }, path: names.slice(3) }
  return
}

/**
 * Every read by name in a value's expression, however the expression combines them, such as `$fetch.body.ip` and
 * `$uuid.body.uuid` in `{% $fetch.body.ip & ' / ' & $uuid.body.uuid %}`: each where it starts and the plain names it
 * goes down. A name the expression binds itself, and JSONata's functions, are no reads. None for a value that is no
 * expression or does not parse.
 */
export const expressionReferences = (value: unknown): Reference[] => {
  const source = expressionSource(value)
  if (source === undefined) return []
  const parsed = parse(source)
  if ('error' in parsed) return []
  const free = expressionReads(parsed.expression).variables
  const found = new Map<string, Reference>()
  const add = (reference: Reference | undefined) => reference && found.set(readText(reference), reference)
  const inPath = new WeakSet<Node>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isNode(node)) return
    if (node.type === 'path' && Array.isArray(node.steps) && node.steps[0]?.type === 'variable') {
      const [first, ...rest] = node.steps
      inPath.add(first!)
      const name = String(first!.value)
      if (name === 'states') add(statesReference(namesAfter(rest)))
      else if (free.has(name)) add({ base: { variable: name }, path: namesAfter(rest) })
    } else if (node.type === 'variable' && !inPath.has(node) && free.has(String(node.value))) {
      add({ base: { variable: String(node.value) }, path: [] })
    }
    for (const [key, child] of Object.entries(node)) if (key !== 'position' && key !== 'value' && key !== 'type') visit(child)
  }
  visit(parsed.expression.ast())
  return [...found.values()]
}

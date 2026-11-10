import { innerMachine, type Definition, type Machine, type State } from '@protobase/workflows'
import { machineAt, splitPath, type StatePath } from '../workflow/definition'
import { reachedStates } from './run-effects'

/** One value of a sample: where it sits, as a JSONata path after what holds it, and how it looks. */
export type SampleValue = { path: string; sample: string }

const simpleKey = /^[A-Za-z_][A-Za-z0-9_]*$/

const step = (key: string) => (simpleKey.test(key) ? key : `\`${key.replaceAll('`', '')}\``)

const shortly = (value: unknown) => {
  const written = JSON.stringify(value) ?? ''
  return written.length > 60 ? `${written.slice(0, 59)}…` : written
}

/** The most values of one sample a picker lists, and how deep it looks. */
const sampleLimit = 100
const depthLimit = 4

/** The values of a sample, the whole of it first, then each field below it, the first item of a list for the list. */
export const sampleValues = (value: unknown): SampleValue[] => {
  const found: SampleValue[] = [{ path: '', sample: shortly(value) }]
  const walk = (at: string, current: unknown, depth: number) => {
    if (depth === depthLimit || typeof current !== 'object' || current === null || found.length >= sampleLimit) return
    if (Array.isArray(current)) {
      if (current.length === 0) return
      const first = `${at}[0]`
      found.push({ path: first, sample: shortly(current[0]) })
      walk(first, current[0], depth + 1)
      return
    }
    for (const [key, inner] of Object.entries(current)) {
      const path = at === '' ? step(key) : `${at}.${step(key)}`
      found.push({ path, sample: shortly(inner) })
      walk(path, inner, depth + 1)
    }
  }
  walk('', value, 0)
  return found.slice(0, sampleLimit)
}

/** A read of the value at `path` below `base`, such as `$customer.email`. */
export const readOf = (base: string, path: string) => (path === '' ? base : `${base}${path.startsWith('[') ? '' : '.'}${path}`)

/**
 * The field's value with `read` added: the read alone when it holds nothing, else joined after the text it holds, as an
 * expression of one string. A field holding anything but text is not offered an insert, which would replace it.
 */
export const withRead = (current: unknown, read: string) => {
  if (current === undefined || current === null || current === '') return `{% ${read} %}`
  if (typeof current !== 'string') throw new Error('A value is inserted only into a field that holds text')
  const whole = /^\{%([\s\S]*)%\}$/.exec(current.trim())
  // What it held stays one term, whatever its operators
  if (whole) return `{% (${whole[1]!.trim()}) & ${read} %}`
  // A JSON string is a JSONata string, its quotes and backslashes escaped
  return `{% ${JSON.stringify(current)} & ${read} %}`
}

/**
 * The states that can come before `path` and give a result: in its own machine, and around the Maps it is inside up to
 * the innermost Block, whose steps read only what it is given.
 */
export const earlierSteps = (definition: Definition, path: StatePath): StatePath[] => {
  const { scope, name } = splitPath(path)
  const before = (machine: Machine, target: string, prefix: readonly string[]) =>
    Object.keys(machine.States)
      .filter((other) => other !== target && reachedStates(machine, other).includes(target))
      .filter((other) => ['Task', 'Map', 'Block'].includes(machine.States[other]!.Type))
      .map((other) => [...prefix, other].join('/'))
  const own = before(machineAt(definition, scope)!, name, scope)
  const blockAt = scope.findLastIndex((_, index) => machineAt(definition, scope.slice(0, index))?.States[scope[index]!]?.Type === 'Block')
  const outer = scope.flatMap((map, index) => (index <= blockAt ? [] : before(machineAt(definition, scope.slice(0, index))!, map, scope.slice(0, index))))
  return [...outer, ...own]
}

const resultRead = '{% $states.result %}'

/**
 * Whether the state at `path` shapes its result with `Output`: its output, which a run shows, is then not the result a
 * variable of it keeps, and no variable can keep the output without working it out again, so it offers no value.
 */
export const shapesItsOutput = (definition: Definition, path: StatePath) => {
  const { scope, name } = splitPath(path)
  const state = machineAt(definition, scope)?.States[name]
  return state !== undefined && 'Output' in state
}

const assignOf = (state: State) => ('Assign' in state && state.Assign ? state.Assign : {}) as Record<string, unknown>

const assignedNames = (machine: Machine): string[] =>
  Object.values(machine.States).flatMap((state) => [...Object.keys(assignOf(state)), ...(innerMachine(state) ? assignedNames(innerMachine(state)!) : [])])

// A name no state of the workflow assigns yet, from the step's own, so a later step cannot overwrite it
const freeVariable = (definition: Definition, stepName: string) => {
  const base = stepName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'step_$1') || 'value'
  const taken = new Set(assignedNames(definition.stateMachine))
  if (!taken.has(base)) return base
  let number = 2
  while (taken.has(`${base}_${number}`)) number++
  return `${base}_${number}`
}

/**
 * The variable that holds `path`'s result, which an earlier step's value is read through, as every value of a workflow
 * is read by name: the one it assigns already, else a new one added to it. `added` says so; the definition stays as it
 * is otherwise.
 */
export const variableFor = (definition: Definition, path: StatePath): { definition: Definition; variable: string; added: boolean } => {
  const { scope, name } = splitPath(path)
  const state = machineAt(definition, scope)!.States[name]!
  const known = Object.entries(assignOf(state)).find(([, value]) => value === resultRead)
  if (known) return { definition, variable: known[0], added: false }
  const variable = freeVariable(definition, name)
  const copy = structuredClone(definition)
  const target = machineAt(copy, scope)!.States[name]! as State & { Assign?: Record<string, unknown> }
  target.Assign = { ...target.Assign, [variable]: resultRead }
  return { definition: copy, variable, added: true }
}


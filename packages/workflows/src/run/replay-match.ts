import type { SavedStep } from './port'

type Row = Pick<SavedStep, 'state' | 'seq' | 'status' | 'attempt'>

/** A run's steps by scope, as far as the run has them. */
export type ScopeRows = ReadonlyMap<string, readonly Row[]>

/** A Map item's scope segment, as `innerScope` writes it: the Map's name, its step's number and the item's index. */
const segmentPattern = /^(.*)\.(\d+)\[(\d+)\]$/

/**
 * Which visit of `state` in its scope the step at `seq` belongs to, from 0: the visits that began before it, less
 * its own when it is a retry, whose step comes right after the try that failed.
 */
const visitAt = (rows: readonly Row[], state: string, seq: number) => {
  const begun = rows.filter((row) => row.state === state && row.attempt === 1 && row.seq < seq).length
  const retry = rows.some((row) => row.seq === seq - 1 && row.state === state && row.status === 'retrying')
  return retry ? begun - 1 : begun
}

/** Which visit of `state` in `scope` the step at `seq` belongs to. */
type VisitOf = (scope: string, state: string, seq: number) => number

/**
 * A scope named by each Map's visit rather than its step's number, so states added or removed before a Map do not
 * change the names of its items' scopes; a scope with no steps yet, such as the run's own while the Map that starts it
 * runs, has no earlier visits.
 */
const logicalScope = (scope: string, visit: VisitOf) => {
  if (scope === '') return ''
  let parent = ''
  const names: string[] = []
  for (const segment of scope.split('/')) {
    const [, name, seq, index] = segmentPattern.exec(segment) ?? []
    if (name === undefined) return
    names.push(`${name}#${visit(parent, decodeURIComponent(name), Number(seq))}[${index}]`)
    parent = parent ? `${parent}/${segment}` : segment
  }
  return names.join('/')
}

const keyOf = (logical: string, state: string, visit: number) => `${logical}|${encodeURIComponent(state)}|${visit}`

/** What a step is matched by between a run and its replay: its scope by visits, its state, and its visit of that state. */
export const matchKey = (rows: ScopeRows, scope: string, state: string, seq: number) => {
  const visit: VisitOf = (at, name, from) => visitAt(rows.get(at) ?? [], name, from)
  const logical = logicalScope(scope, visit)
  if (logical === undefined) return
  return keyOf(logical, state, visit(scope, state, seq))
}

/**
 * The visit of each step of a run, by its scope and seq, counted in one pass over the steps in seq order: what
 * `visitAt` gives each of them, without scanning its scope again for every step.
 */
const stepVisits = (sorted: readonly SavedStep[]) => {
  const begun = new Map<string, number>()
  const last = new Map<string, SavedStep>()
  const visits = new Map<string, number>()
  for (const step of sorted) {
    const counted = `${step.scope}|${encodeURIComponent(step.state)}`
    const before = begun.get(counted) ?? 0
    const previous = last.get(step.scope)
    const retry = previous?.seq === step.seq - 1 && previous.state === step.state && previous.status === 'retrying'
    visits.set(`${step.scope}|${step.seq}`, retry ? before - 1 : before)
    if (step.attempt === 1) begun.set(counted, before + 1)
    last.set(step.scope, step)
  }
  return visits
}

/** A run's steps by scope. */
export const rowsByScope = <S extends Row & { scope: string }>(steps: readonly S[]) => {
  const rows = new Map<string, S[]>()
  for (const step of steps) {
    const scopeRows = rows.get(step.scope)
    if (scopeRows) scopeRows.push(step)
    else rows.set(step.scope, [step])
  }
  return rows
}

/** The last try of each visit of each state of a run, by its match key, from one pass over its steps. */
export const visitOutcomes = (steps: readonly SavedStep[]) => {
  const sorted = [...steps].sort((a, b) => a.seq - b.seq)
  const rows = rowsByScope(sorted)
  const visits = stepVisits(sorted)
  const visit: VisitOf = (scope, state, seq) => visits.get(`${scope}|${seq}`) ?? visitAt(rows.get(scope) ?? [], state, seq)
  const scopes = new Map<string, string | undefined>()
  const outcomes = new Map<string, SavedStep>()
  for (const step of sorted) {
    if (!scopes.has(step.scope)) scopes.set(step.scope, logicalScope(step.scope, visit))
    const logical = scopes.get(step.scope)
    if (logical !== undefined) outcomes.set(keyOf(logical, step.state, visits.get(`${step.scope}|${step.seq}`)!), step)
  }
  return outcomes
}

/** The Map names a scope runs inside, outermost first. */
export const mapNames = (scope: string) => (scope === '' ? [] : scope.split('/').map((segment) => decodeURIComponent(segmentPattern.exec(segment)?.[1] ?? '')))

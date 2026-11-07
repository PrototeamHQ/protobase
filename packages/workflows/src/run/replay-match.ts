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

/**
 * A scope named by each Map's visit rather than its step's number, so states added or removed before a Map do not
 * change the names of its items' scopes; undefined when a Map's scope has no steps to count its visit by.
 */
const logicalScope = (rows: ScopeRows, scope: string) => {
  if (scope === '') return ''
  let parent = ''
  const names: string[] = []
  for (const segment of scope.split('/')) {
    const [, name, seq, index] = segmentPattern.exec(segment) ?? []
    const parentRows = rows.get(parent)
    if (name === undefined || !parentRows) return
    names.push(`${name}#${visitAt(parentRows, decodeURIComponent(name), Number(seq))}[${index}]`)
    parent = parent ? `${parent}/${segment}` : segment
  }
  return names.join('/')
}

/** What a step is matched by between a run and its replay: its scope by visits, its state, and its visit of that state. */
export const matchKey = (rows: ScopeRows, scope: string, state: string, seq: number) => {
  const logical = logicalScope(rows, scope)
  if (logical === undefined) return
  return `${logical}|${encodeURIComponent(state)}|${visitAt(rows.get(scope) ?? [], state, seq)}`
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

/** The last try of each visit of each state of a run, by its match key. */
export const visitOutcomes = (steps: readonly SavedStep[]) => {
  const rows = rowsByScope(steps)
  const outcomes = new Map<string, SavedStep>()
  for (const step of [...steps].sort((a, b) => a.seq - b.seq)) {
    const key = matchKey(rows, step.scope, step.state, step.seq)
    if (key !== undefined) outcomes.set(key, step)
  }
  return outcomes
}

/** The Map names a scope runs inside, outermost first. */
export const mapNames = (scope: string) => (scope === '' ? [] : scope.split('/').map((segment) => decodeURIComponent(segmentPattern.exec(segment)?.[1] ?? '')))

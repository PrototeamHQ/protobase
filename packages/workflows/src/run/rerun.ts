import type { Machine } from '../definition/types'
import type { SavedStep } from './port'

/** What a re-run reads of a failed run's step to know whether to keep it. */
export type EarlierStep = Pick<SavedStep, 'scope' | 'seq' | 'state' | 'status' | 'next'>

// A Map item's scope: the scope of the Map's step, the Map's name and its step's number, as `innerScope` writes it.
const itemOf = (scope: string) => {
  const slash = scope.lastIndexOf('/')
  const match = /^(.*)\.(\d+)\[\d+\]$/.exec(scope.slice(slash + 1))
  if (!match) throw new Error(`"${scope}" is not the scope of a Map item`)
  return { parent: slash < 0 ? '' : scope.slice(0, slash), map: decodeURIComponent(match[1]!), seq: Number(match[2]) }
}

// A scope's steps without the try that failed it and the retried tries of that state before it, so the state runs
// again from its first try.
const withoutFailure = <S extends EarlierStep>(steps: readonly S[]) => {
  if (steps.at(-1)?.status !== 'failed') return [...steps]
  const failed = steps.at(-1)!
  let end = steps.length - 1
  while (end > 0 && steps[end - 1]!.status === 'retrying' && steps[end - 1]!.state === failed.state) end--
  return steps.slice(0, end)
}

/**
 * The steps of a failed run that a re-run of it keeps, to run on from where they leave it with `machine`, the workflow's
 * version now: every step but, in each scope, the try that failed it and that state's retried tries before it, so the
 * failed state runs again from its first try. A finished Map's items are kept as they ran; the items of a Map that runs
 * again are kept where they stand, each without its own failed try, and those of a Map's earlier tries are not.
 * Returns the problem instead when a scope would go on at a state the version does not have.
 */
export const rerunSteps = <S extends EarlierStep>(machine: Machine, steps: readonly S[]): { steps: S[] } | { problem: string } => {
  const byScope = new Map<string, S[]>()
  for (const step of [...steps].sort((a, b) => a.seq - b.seq)) byScope.set(step.scope, [...(byScope.get(step.scope) ?? []), step])
  const children = new Map<string, string[]>()
  for (const scope of byScope.keys()) {
    if (scope === '') continue
    const { parent } = itemOf(scope)
    children.set(parent, [...(children.get(parent) ?? []), scope])
  }
  const kept: S[] = []
  // A finished scope is history: its steps and its items' steps stay as they ran.
  const keepAll = (scope: string) => {
    kept.push(...(byScope.get(scope) ?? []))
    for (const child of children.get(scope) ?? []) keepAll(child)
  }
  const keepFrom = (scope: string, inner: Machine): string | undefined => {
    const own = withoutFailure(byScope.get(scope) ?? [])
    kept.push(...own)
    const last = own.at(-1)
    const at = last === undefined ? inner.StartAt : last.status === 'retrying' ? last.state : last.next
    if (at !== null && !Object.hasOwn(inner.States, at)) return `The run goes on at state "${at}"${scope ? ` in ${scope}` : ''}, which the workflow no longer has`
    const state = at === null ? undefined : inner.States[at]
    const ran = new Set(own.map((step) => step.seq))
    const next = last === undefined ? 0 : last.seq + 1
    for (const child of children.get(scope) ?? []) {
      const item = itemOf(child)
      if (ran.has(item.seq)) keepAll(child)
      else if (item.seq === next && item.map === at && state?.Type === 'Map') {
        const problem = keepFrom(child, state.ItemProcessor)
        if (problem) return problem
      }
    }
    return
  }
  const problem = keepFrom('', machine)
  return problem ? { problem } : { steps: kept }
}

/** How a state keeps its whole result in a variable. */
export const resultRead = '{% $states.result %}'

/**
 * What a kept step assigned, with each variable its state has on the version a re-run runs that keeps its whole result
 * holding that result, whatever it held then: a step kept as it ran still gives what a later step now reads from it, and
 * nothing runs again for it. Its other variables stay as they ran, and so does all a step that did not succeed assigned.
 * The step's output is its whole result only where its state in `ran`, the version the earlier run ran, had no `Output`:
 * a step whose result was shaped then keeps what it assigned, as nothing knows its whole result any more.
 */
export const keptAssigned = (machine: Machine, ran: Machine, step: { scope: string; state: string; status: string; output?: unknown; assigned?: unknown }) => {
  // A step that failed into a catcher gave an error, not its result, and assigned what the catcher says
  const state = step.scope === '' && step.status === 'succeeded' ? machine.States[step.state] : undefined
  const before = ran.States[step.state]
  const assign = state && 'Assign' in state ? (state.Assign as Record<string, unknown> | undefined) : undefined
  if (!state || !assign || !before || ('Output' in before && before.Output !== undefined)) return undefined
  const assigned = (step.assigned ?? {}) as Record<string, unknown>
  const whole = Object.keys(assign).filter((name) => assign[name] === resultRead && JSON.stringify(assigned[name]) !== JSON.stringify(step.output))
  return whole.length === 0 ? undefined : { ...assigned, ...Object.fromEntries(whole.map((name) => [name, step.output])) }
}

/**
 * The steps of an ended run that a re-run from `state`, a state of the workflow itself and not of a Map, keeps: those
 * before its first visit, with the items of the Maps among them as they ran, so the run goes on at `state` with `machine`,
 * the workflow's version now, and everything from there runs again. Returns the problem instead when the run never
 * reached it, or the version does not have it or starts elsewhere.
 */
export const rerunFromSteps = <S extends EarlierStep>(machine: Machine, steps: readonly S[], state: string): { steps: S[] } | { problem: string } => {
  const own = steps.filter((step) => step.scope === '').sort((a, b) => a.seq - b.seq)
  const from = own.findIndex((step) => step.state === state)
  if (from === -1) return { problem: `The run never reached state "${state}"` }
  if (!Object.hasOwn(machine.States, state)) return { problem: `The workflow no longer has state "${state}"` }
  if (from === 0 && machine.StartAt !== state) return { problem: `The workflow no longer starts at state "${state}"` }
  const kept = own.slice(0, from)
  const seqs = new Set(kept.map((step) => step.seq))
  // A Map's item sits under the step of its Map, whose number its outermost scope carries
  const inner = steps.filter((step) => step.scope !== '' && seqs.has(itemOf(step.scope.split('/')[0]!).seq))
  return { steps: [...kept, ...inner] }
}

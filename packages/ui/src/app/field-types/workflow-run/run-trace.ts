import type { NodeStatus, NodeTrace } from '../workflow/node-trace'

/** What the graph reads of a run's step. */
export type TraceStep = { scope: string; state: string; status: Exclude<NodeStatus, 'current'>; next: string | null }

/** A Map item a step ran in: the Map's name and the item's index from 0. */
export type ScopeItem = { map: string; index: number }

/** The Map items of a step's scope, outermost first: `Each.3[0]` is item 0 of the Map `Each`. */
export const scopeItems = (scope: string): ScopeItem[] =>
  scope === ''
    ? []
    : scope.split('/').map((part) => {
        const match = /^(.*)\.\d+\[(\d+)\]$/.exec(part)
        if (!match) throw new Error(`"${scope}" is not a step's scope`)
        return { map: decodeURIComponent(match[1]!), index: Number(match[2]) }
      })

/** The graph's path of the state a step ran in its scope: the Maps it is inside, then its name. */
export const statePath = (scope: string, state: string) => [...scopeItems(scope).map((item) => item.map), state].join('/')

// When a state's scopes disagree, such as a Map's items, the mark that most needs a look wins.
const weight: Record<NodeStatus, number> = { succeeded: 0, caught: 1, retrying: 2, failed: 3, current: 4 }

/**
 * Each state's mark from the run's steps in the order they ran: how its last step in each scope ended, the worst of them
 * for a Map's items, and while the run goes on, `current` on the state each scope goes on to, or on the first state when
 * nothing ran yet.
 */
export const nodeTraces = (steps: readonly TraceStep[], { inProgress, startAt }: { inProgress: boolean; startAt: string }) => {
  const counts = new Map<string, number>()
  const lastOfState = new Map<string, TraceStep>()
  const lastOfScope = new Map<string, TraceStep>()
  for (const step of steps) {
    const path = statePath(step.scope, step.state)
    counts.set(path, (counts.get(path) ?? 0) + 1)
    lastOfState.set(`${step.scope}\n${step.state}`, step)
    lastOfScope.set(step.scope, step)
  }
  const statuses = new Map<string, NodeStatus>()
  const mark = (path: string, status: NodeStatus) => {
    const known = statuses.get(path)
    if (known === undefined || weight[status] > weight[known]) statuses.set(path, status)
  }
  for (const step of lastOfState.values()) mark(statePath(step.scope, step.state), step.status)
  if (inProgress) {
    if (!lastOfScope.has('') && startAt) mark(startAt, 'current')
    for (const step of lastOfScope.values()) if (step.status !== 'retrying' && step.next !== null) mark(statePath(step.scope, step.next), 'current')
  }
  return new Map<string, NodeTrace>([...statuses].map(([path, status]) => [path, { status, steps: counts.get(path) ?? 0 }]))
}

import type { Definition, Machine } from '../definition/types'
import type { SavedStep, StepRecord } from './port'
import { rowsByScope, visitOutcomes } from './replay-match'

/** The run a replay replays: the definition it ran and its steps. */
export type Replayed = { definition: Definition; steps: readonly SavedStep[] }

/**
 * What a replay matches its held-back steps by: the replayed run's last try of each visit, the definition it ran,
 * and the replay's own steps so far, by scope, which `seen` adds to as the replay saves them.
 */
export const replayOf = (replayed: Replayed, saved: readonly SavedStep[]) => {
  const seen = rowsByScope(saved)
  return {
    outcomes: visitOutcomes(replayed.steps),
    machine: replayed.definition.stateMachine as Machine,
    seen: seen as ReadonlyMap<string, readonly SavedStep[]>,
    add: (step: StepRecord) => {
      const rows = seen.get(step.scope)
      if (rows) rows.push(step)
      else seen.set(step.scope, [step])
    },
  }
}

export type Replay = ReturnType<typeof replayOf>

import type { Definition, Machine } from '../definition/types'
import type { ReplayedStep } from './port'
import { visitOutcomes } from './replay-match'

/** The run a replay replays: the definition it ran and its steps, as its trace keeps them. */
export type Replayed = { definition: Definition; steps: readonly ReplayedStep[] }

/** What a replay matches its held-back steps by: the replayed run's last try of each visit, and the definition it ran. */
export const replayOf = (replayed: Replayed) => ({
  outcomes: visitOutcomes(replayed.steps),
  machine: replayed.definition.stateMachine as Machine,
})

export type Replay = ReturnType<typeof replayOf>

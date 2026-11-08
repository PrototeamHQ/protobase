import type { Machine } from '../definition/types'
import type { Checkpoint, StepRecord } from './port'
import { advance, checkpointOf, startPosition } from './position'
import { keptAssigned } from './rerun'

/** What a re-run from a step starts from: the run's checkpoint at that step, none when it is the first, and the trace entries it keeps. */
export type RerunFrom = { checkpoint?: Checkpoint; kept: StepRecord[] }

// A trace read back from JSON holds its times as text.
const revived = (step: StepRecord): StepRecord => ({
  ...step,
  startedAt: new Date(step.startedAt),
  finishedAt: new Date(step.finishedAt),
  ...(step.resumeAt && { resumeAt: new Date(step.resumeAt) }),
})

// The Map step an item's scope sits under, whose number its outermost part carries, as `innerScope` writes it.
const mapSeq = (scope: string) => Number(/\.(\d+)\[\d+\]$/.exec(scope.split('/')[0]!)?.[1])

/**
 * Where a re-run from `state`, a state of the workflow itself and not of a Map, of an ended run whose trace holds
 * `steps` goes on: the root steps before the state's first visit stay as they ran, and are folded into the run's
 * checkpoint at that state with the variables they assigned, so it and everything after it run again on `machine`, the
 * workflow's version now, at `clock`. `ran` is the version the earlier run ran. The steps kept, with the items of the
 * Maps among them, go into the re-run's trace. Returns the problem instead when the run never reached the state, the
 * version does not have it or starts elsewhere, or the trace does not hold every step before it, as for a re-run that
 * went on from a checkpoint.
 */
export const rerunFrom = (machine: Machine, ran: Machine, steps: readonly StepRecord[], state: string, clock: Date): RerunFrom | { problem: string } => {
  // A step a crash made run again is in the trace once for each time it ran; the last is the one its scope went on from.
  const latest = new Map(steps.map((step) => [`${step.scope}\n${step.seq}`, revived(step)]))
  const unique = [...latest.values()]
  const own = unique.filter((step) => step.scope === '').sort((a, b) => a.seq - b.seq)
  const from = own.findIndex((step) => step.state === state)
  if (from === -1) return { problem: `The run never reached state "${state}"` }
  if (!Object.hasOwn(machine.States, state)) return { problem: `The workflow no longer has state "${state}"` }
  if (from === 0 && machine.StartAt !== state) return { problem: `The workflow no longer starts at state "${state}"` }
  const before = own.slice(0, from)
  if (before.some((step, index) => step.seq !== index)) return { problem: `The run's trace does not hold every step before state "${state}"` }
  if (before.length === 0) return { kept: [] }

  let position = startPosition(machine, null, clock)
  for (const step of before) position = advance(position, { ...step, assigned: keptAssigned(machine, ran, step) ?? step.assigned ?? {} })
  if (position.kind !== 'at' || position.state !== state) return { problem: `The run's trace does not lead to state "${state}"` }
  const { resumeAt: _, ...made } = checkpointOf(position, before.at(-1)!, clock)
  const checkpoint = { ...made, attempt: 1, failures: [], clock, after: -1 }
  const seqs = new Set(before.map((step) => step.seq))
  const kept = unique.filter((step) => (step.scope === '' ? seqs.has(step.seq) : seqs.has(mapSeq(step.scope))))
  return { checkpoint, kept }
}

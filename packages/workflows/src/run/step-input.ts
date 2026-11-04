import { inputVariable } from '../definition/names'
import type { Machine } from '../definition/types'
import type { ScopeOutcome, SegmentContext } from './context'
import type { Bindings } from './evaluate'
import type { Position } from './position'
import type { StepLog } from './port'

export type At = Extract<Position, { kind: 'at' }>

/** What a state's code gets: the segment, where its scope stands, the names it reads and its step's logs. */
export type StateCall = {
  context: SegmentContext
  /** The state's name. */
  name: string
  scope: string
  position: At
  /** `$trigger`, the outer scopes' variables and this scope's; `states` is added where a field reads it. */
  bindings: Bindings
  logs: StepLog[]
  /** Runs an inner scope (a Map item, a Parallel branch) under `key`, seeing these variables. */
  runScope: (machine: Machine, key: string, input: unknown, outer: Record<string, unknown>) => Promise<ScopeOutcome>
}

/**
 * The names an expression reads in a scope: the outer scopes' variables, this one's, the run's input, and the state's
 * input as `$states.input`, which the check lets only a Map item's first state read.
 */
export const bindingsOf = (context: SegmentContext, outer: Record<string, unknown>, position: At): Bindings => ({
  ...outer,
  ...position.variables,
  [inputVariable]: context.trigger,
  states: { input: position.input },
})

/** The variables an inner scope sees: every one in scope here, without `$trigger`, which each scope adds itself. */
export const visibleVariables = ({ [inputVariable]: _, states: __, ...variables }: Bindings) => variables

/** The key of an inner scope: item or branch `index` of the state `name` that was step `seq` of `scope`. */
export const innerScope = (scope: string, name: string, seq: number, index: number) => `${scope ? `${scope}/` : ''}${name}.${seq}[${index}]`

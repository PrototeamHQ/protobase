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
  /** The outer scopes' variables, this scope's, and `$states` with the run's context and the state's input. */
  bindings: Bindings
  logs: StepLog[]
  /** Runs an inner scope (a Map item) under `key`, seeing these variables. */
  runScope: (machine: Machine, key: string, input: unknown, outer: Record<string, unknown>) => Promise<ScopeOutcome>
}

/**
 * The names an expression reads in a scope: the outer scopes' variables, this one's, and `$states` with the run's
 * context and the state's input as `$states.input`, which the check lets only a Map item's first state read.
 */
export const bindingsOf = (context: SegmentContext, outer: Record<string, unknown>, position: At): Bindings => ({
  ...outer,
  ...position.variables,
  states: { input: position.input, context: context.stateContext },
})

/** The variables an inner scope sees: every one in scope here, without `$states`, which each scope adds itself. */
export const visibleVariables = ({ states: _, ...variables }: Bindings) => variables

/**
 * The key of an inner scope: item `index` of the Map `name` that was step `seq` of `scope`, such as `Each.3[0]`. The
 * name is URI-encoded, so a `/` or `[` in a state's name cannot make two scopes' keys the same.
 */
export const innerScope = (scope: string, name: string, seq: number, index: number) => `${scope ? `${scope}/` : ''}${encodeURIComponent(name)}.${seq}[${index}]`

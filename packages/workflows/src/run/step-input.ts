import type { Machine } from '../definition/types'
import type { ScopeOutcome, SegmentContext } from './context'
import type { Bindings } from './evaluate'
import type { Position } from './position'
import type { StepLog } from './port'
import { stepFunctionNames, stepFunctions } from './step-functions'

export type At = Extract<Position, { kind: 'at' }>

/** What a state's code gets: the segment, where its scope stands, the names it reads and its step's logs. */
export type StateCall = {
  context: SegmentContext
  /** The state's name. */
  name: string
  scope: string
  /** The scope with each Map named by its visit, which a replay matches steps by. */
  logical: string
  position: At
  /** Which visit of this state in its scope the step belongs to, from 0. */
  visit: number
  /** The outer scopes' variables, this scope's, and `$states` with the run's context and the state's input. */
  bindings: Bindings
  logs: StepLog[]
  /** Runs item `index` of this state's Map as an inner scope, seeing these variables, from the clock of this one. */
  runScope: (machine: Machine, index: number, input: unknown, outer: Record<string, unknown>) => Promise<ScopeOutcome>
}

/**
 * The names an expression reads in a scope: the outer scopes' variables, this one's, `$states` with the run's context
 * and the state's input as `$states.input`, which the check lets only a Map item's first state read, and the step's own
 * `$now`, `$millis`, `$random` and `$shuffle`.
 */
export const bindingsOf = (context: SegmentContext, outer: Record<string, unknown>, scope: string, position: At): Bindings => ({
  ...outer,
  ...position.variables,
  ...stepFunctions(position.clock, `${context.runId}/${scope}/${position.seq}/${position.attempt}`),
  states: { input: position.input, context: context.stateContext },
})

/** The variables an inner scope sees: every one in scope here, without `$states` and the step's functions, which each scope adds itself. */
export const visibleVariables = (bindings: Bindings) => {
  const { states: _, ...variables } = bindings
  for (const name of stepFunctionNames) delete variables[name]
  return variables
}

/**
 * The key of an inner scope: item `index` of the Map `name` that was step `seq` of `scope`, such as `Each.3[0]`. The
 * name is URI-encoded, so a `/` or `[` in a state's name cannot make two scopes' keys the same.
 */
export const innerScope = (scope: string, name: string, seq: number, index: number) => `${scope ? `${scope}/` : ''}${encodeURIComponent(name)}.${seq}[${index}]`

import type { StateResult } from './context'

export type Failure = { Error: string; Cause: string }
/** How a Task, Map or Block ran: a Block's result says when it was fetched and which block's run gave it. */
export type Ran =
  | { result: unknown; input: unknown; recorded?: boolean; fetchedAt?: Date; run?: string; reused?: true }
  | { held: true; input: unknown }
  | { failure: Failure; input: unknown; recorded?: boolean; run?: string }
  | Extract<StateResult, { kind: 'blocked' | 'yielded' }>

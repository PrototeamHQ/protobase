import { andResults, orResults } from './combine'
import type { AccessFn, AccessResult } from './types'

/** An access function that can be combined with plain functions or other rules. */
export type Rule<R = any> = AccessFn<R> & {
  /** Both must allow; filters are ANDed. */
  and: (other: AccessFn<R>) => Rule<R>
  /** Either may allow; filters are ORed. */
  or: (other: AccessFn<R>) => Rule<R>
}

const combine =
  <R>(join: (a: AccessResult, b: AccessResult) => AccessResult, left: AccessFn<R>, right: AccessFn<R>): AccessFn<R> =>
  async (ctx, record, input) => join(await left(ctx, record, input), await right(ctx, record, input))

export const rule = <R = any>(fn: AccessFn<R>): Rule<R> =>
  Object.assign((ctx: Parameters<AccessFn<R>>[0], record?: R, input?: Partial<R>) => fn(ctx, record, input), {
    and: (other: AccessFn<R>) => rule(combine(andResults, fn, other)),
    or: (other: AccessFn<R>) => rule(combine(orResults, fn, other)),
  })

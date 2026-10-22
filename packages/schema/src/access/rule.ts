import { andResults, normalize, orResults } from './combine'
import type { AccessFn, AccessResult } from './types'

/** An access function that can be combined with plain functions or other rules. */
export type Rule<R = any> = AccessFn<R> & {
  /** Both must allow; filters are ANDed. The other side is not run once this one denies. */
  and: (other: AccessFn<R>) => Rule<R>
  /** Either may allow; filters are ORed. The other side is not run once this one allows. */
  or: (other: AccessFn<R>) => Rule<R>
}

// A rule that needs the record throws a TypeError without one; held back so the other side can still decide.
const settle = async <R>(fn: AccessFn<R>, ...args: Parameters<AccessFn<R>>) => {
  try {
    return { result: normalize(await fn(...args)) }
  } catch (error) {
    if (error instanceof TypeError) return { error }
    throw error
  }
}

// The left side runs first and the right only when the left leaves it open; a side returning `decided` settles the
// result even when the other threw for want of the record, so a missing record never widens access.
const combine =
  <R>(join: (a: AccessResult, b: AccessResult) => AccessResult, decided: boolean, left: AccessFn<R>, right: AccessFn<R>): AccessFn<R> =>
  async (...args) => {
    const a = await settle(left, ...args)
    if (a.result === decided) return decided
    const b = await settle(right, ...args)
    if (b.result === decided) return decided
    if (a.error) throw a.error
    if (b.error) throw b.error
    return join(a.result!, b.result!)
  }

/**
 * Wraps an access function so it combines with others through `.and()` and `.or()`; `roles.can()` and `roles.is()`
 * return such rules already.
 *
 * @example
 * ```ts
 * const notShipped = rule((ctx, order) => order?.status !== 'shipped')
 * resource('orders').access({ update: notShipped.and(roles.can('orders.update')) })
 * ```
 */
export const rule = <R = any>(fn: AccessFn<R>): Rule<R> =>
  Object.assign((ctx: Parameters<AccessFn<R>>[0], record?: R, input?: Partial<R>) => fn(ctx, record, input), {
    and: (other: AccessFn<R>) => rule(combine(andResults, false, fn, other)),
    or: (other: AccessFn<R>) => rule(combine(orResults, true, fn, other)),
  })

/**
 * The time every snapshot test runs at, after every time in the fixtures; the Postgres clock's times come back a day
 * earlier (server-times.ts).
 */
export const testClock = new Date(Date.UTC(2026, 7, 1))

const RealDate = Date
const fixed = testClock.getTime()

// Date standing still at `testClock`: `new Date()`, `Date()` and `Date.now()`, while a Date of a given time and the
// timers stay real. Not Vitest's fake timers, whose clock `vi.waitFor` moves on by its interval at every check, so by
// how many checks a run happened to need.
const FixedDate = new Proxy(RealDate, {
  construct: (target, args: unknown[]) => (args.length ? new target(...(args as [number])) : new target(fixed)),
  apply: () => new RealDate(fixed).toString(),
  get: (target, property, receiver) => (property === 'now' ? () => fixed : Reflect.get(target, property, receiver)),
})

/** Date stands still at `testClock` until `unfixClock`. */
export const fixClock = () => {
  globalThis.Date = FixedDate
}

export const unfixClock = () => {
  globalThis.Date = RealDate
}

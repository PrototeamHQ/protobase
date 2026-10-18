import { vi } from 'vitest'

/** The time every snapshot test runs at: the Postgres clock's times come back a day earlier (server-times.ts). */
export const testClock = new Date(Date.UTC(2026, 0, 15, 0, 0, 0))

/** Date stands still at `testClock`; timers stay real. */
export const fixClock = () => vi.useFakeTimers({ toFake: ['Date'], now: testClock })

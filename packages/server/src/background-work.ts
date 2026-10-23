import { AsyncLocalStorage } from 'node:async_hooks'

const background = new AsyncLocalStorage<{ longQueries: boolean }>()

/**
 * Runs `work` as background work: function calls and jobs, as opposed to page and API requests. A pool that knows,
 * such as the runtime's, keeps a connection free for requests however many connections background work holds, and
 * gives work with `longQueries` a connection whose queries may run up to `longQueryTimeoutMs`.
 */
export const runInBackground = <T>(work: () => T, options: { longQueries?: boolean } = {}) => background.run({ longQueries: options.longQueries === true }, work)

/** Whether the caller runs inside `runInBackground`. */
export const isBackgroundWork = () => background.getStore() !== undefined

/** Whether the caller runs inside `runInBackground` with `longQueries`. */
export const wantsLongQueries = () => background.getStore()?.longQueries === true

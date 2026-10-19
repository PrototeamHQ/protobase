import { AsyncLocalStorage } from 'node:async_hooks'

const background = new AsyncLocalStorage<true>()

/**
 * Runs `work` as background work: function calls and jobs, as opposed to page and API requests. A pool that knows,
 * such as the runtime's, keeps a connection free for requests however many connections background work holds.
 */
export const runInBackground = <T>(work: () => T) => background.run(true, work)

/** Whether the caller runs inside `runInBackground`. */
export const isBackgroundWork = () => background.getStore() === true

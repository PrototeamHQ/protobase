import type { PluginConnection, PollingTrigger } from '@protobase/workflows/plugin'
import type { FakeGmail } from './fake-gmail'

/** A connection that gives `tokens` in turn, then the last one again, keeping whether each ask forced a refresh. */
export const fakeConnection = (...tokens: string[]) => {
  const refreshes: boolean[] = []
  const connection: PluginConnection & { asked: () => number; refreshes: boolean[] } = {
    accessToken: async (options) => tokens[Math.min(refreshes.push(options?.refresh === true) - 1, tokens.length - 1)]!,
    asked: () => refreshes.length,
    refreshes,
  }
  return connection
}

/**
 * Starts `trigger` against the fake and polls it as the server does, keeping its cursor: `poll` gives one poll's
 * items. `due` moves a minute on each poll.
 */
export const pollingRun = (trigger: PollingTrigger, gmail: FakeGmail, { input = {}, connection = fakeConnection('token-1') as PluginConnection, limit = trigger.limit ?? 100 }: { input?: Record<string, unknown>; connection?: PluginConnection; limit?: number } = {}) => {
  const signal = new AbortController().signal
  const context = () => ({ input, connection, fetch: gmail.fetch, signal })
  let cursor: unknown
  let due = new Date('2027-01-15T08:00:00Z')
  return {
    start: async () => (cursor = await trigger.start(context())),
    poll: async () => {
      due = new Date(due.getTime() + 60_000)
      const result = await trigger.poll({ ...context(), cursor, store: undefined, limit, due })
      cursor = result.cursor
      return result.items
    },
    get cursor() {
      return cursor
    },
    set cursor(value: unknown) {
      cursor = value
    },
  }
}

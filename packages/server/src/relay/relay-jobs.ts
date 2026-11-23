import { defineJob } from '../jobs/define-job'
import { RelayRefusal, type RelayClient, type RelayCommand } from './relay-commands'
import { closeSessionsJob } from './sessions-sql'

/** The group the relay's commands run in, one job at a time, in the order the dispatches queued them. */
const sendGroup = 'relay'

type RelayJobsInput = {
  client: RelayClient
  /** When a sign-in session ends now, or `undefined` once it is gone. */
  sessionEnd: (session: string) => Promise<Date | undefined>
  /** Where a command the relay refused goes: sending it again would not change the answer. */
  report: (error: unknown) => void
}

/**
 * The relay's jobs:
 *
 * - `relay.send`, one for each dispatch that has anything for the relay: its commands, in order. A relay that is down
 *   holds back the later ones, which keep trying, once a minute at most; every command is idempotent, so a retry sends
 *   them all again. A command the relay refuses is reported and passed over.
 * - `relay.close-sessions`, which the delete of sign-in sessions queues: it closes their sockets.
 * - `relay.session-expiry`, queued at a ticket for its sign-in session's expiry: it closes the session's sockets once
 *   it expired or is gone, and waits for the new expiry of one that was extended meanwhile.
 */
export const relayJobs = ({ client, sessionEnd, report }: RelayJobsInput) => {
  const send = defineJob<{ commands: RelayCommand[] }>({
    name: 'relay.send',
    ordered: true,
    maxAttempts: 1_000_000,
    retryDelay: '1 second',
    maxRetryDelay: '1 minute',
    timeout: '5 minutes',
    run: async ({ commands }) => {
      for (const command of commands) {
        await client.send(command).catch((error: unknown) => {
          if (!(error instanceof RelayRefusal)) throw error
          report(error)
        })
      }
    },
  })

  const closeSessions = defineJob<{ sessions: string[] }>({
    name: closeSessionsJob,
    retryDelay: '5 seconds',
    run: async ({ sessions }) => {
      for (const session of sessions) await client.closeSession(session)
    },
  })

  const sessionExpiry = defineJob<{ session: string }>({
    name: 'relay.session-expiry',
    retryDelay: '5 seconds',
    run: async ({ session }, { db }) => {
      const end = await sessionEnd(session)
      if (end && end.getTime() > Date.now()) {
        await sessionExpiry.enqueue(db, { session }, { key: session, runAt: end })
        return
      }
      await client.closeSession(session)
    },
  })

  return {
    jobs: [send, closeSessions, sessionExpiry],
    /** Queues a dispatch's commands, in its transaction; nothing when it has none. */
    queue: async (db: Parameters<typeof send.enqueue>[0], commands: RelayCommand[]) => {
      if (commands.length > 0) await send.enqueue(db, { commands }, { group: sendGroup })
    },
    /** Queues the close of the session's sockets at its expiry, once for each session. */
    watchSession: (db: Parameters<typeof send.enqueue>[0], session: string, end: Date) => sessionExpiry.enqueue(db, { session }, { key: session, runAt: end }),
  }
}

export type RelayJobs = ReturnType<typeof relayJobs>

/**
 * The relay's jobs while the app can use the relay but does not: `relay.close-sessions`, which the delete of sign-in
 * sessions queues all the same, completes at once, as no socket is open on the relay.
 */
export const idleRelayJobs = () => [defineJob<{ sessions: string[] }>({ name: closeSessionsJob, run: async () => {} })]

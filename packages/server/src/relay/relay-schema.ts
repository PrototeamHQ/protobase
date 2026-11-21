import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import { sessionsTable } from './session-end'
import { checkRelaySessions, relaySessionsMigration } from './sessions-sql'

const needsAuth = (auth: AdminAuth | undefined) => {
  if (!auth) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  return auth
}

/** The SQL the relay needs of the app's database: the trigger that closes a deleted session's sockets; `undefined` when it is current. */
export const relayMigration = (db: Db, auth: AdminAuth | undefined) => relaySessionsMigration(db, sessionsTable(needsAuth(auth)))

/** Refuses to start while the relay's trigger is missing or out of date. */
export const checkRelaySchema = (db: Db, auth: AdminAuth | undefined) => checkRelaySessions(db, sessionsTable(needsAuth(auth)))

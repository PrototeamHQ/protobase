import { sql } from 'kysely'
import { sameRowFilter, type Db, type Scope } from '@protobase/query'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import type { Session } from '../../types'
import { changeCondition } from './change-condition'
import { liveTokenKey } from './live-key'
import { liveSubject } from './live-subject'
import { sealLiveToken, type LiveSubject } from './live-token'

// The read's table as the change stream names it: `schema.table` outside the public schema; undefined for a name with a
// dot, which the stream never takes, since it could name another table too.
const changeResource = ({ table }: ResourceModel) => {
  if (table.name.includes('.') || table.schema?.includes('.')) return
  return table.schema && table.schema !== 'public' ? `${table.schema}.${table.name}` : table.name
}

/** What a read gave a live token for: the query's model and scope, the caller's filter and the fields it returned. */
export type LiveTokenRead = { model: ResourceModel; scope: Scope; filter?: CheckedFilter; fields: string[] }

export type LiveTokens = {
  /** Whom a token would be for, before the read's transaction opens; undefined when the caller gets none. */
  subject: (session: Session) => Promise<LiveSubject | undefined>
  /** The token for the read, in its REPEATABLE READ transaction; undefined when it cannot be made or is too long. */
  seal: (trx: Db, subject: LiveSubject, read: LiveTokenRead) => Promise<string | undefined>
}

/** Live tokens sealed with the key derived from the relay's ticket key, for the app the relay knows as `app`. */
export const liveTokens = (options: { app: string; ticketKey: string; sessionEnd: (id: string) => Promise<Date | undefined> }): LiveTokens => {
  const key = liveTokenKey(options.ticketKey)
  return {
    subject: (session) => liveSubject(session, options.sessionEnd),
    seal: async (trx, subject, read) => {
      const resource = changeResource(read.model)
      if (!resource) return
      const filter = await sameRowFilter(trx, read.model, read.scope, read.filter)
      if (filter === false) return
      const where = filter && changeCondition(filter)
      if (filter && !where) return
      const { rows } = await sql<{ snapshot: string }>`select pg_current_snapshot()::text as snapshot`.execute(trx)
      const claims = { subs: [{ resource, ...(where && { where }) }], fields: read.fields, snapshot: rows[0]!.snapshot }
      return sealLiveToken(await key, options.app, claims, subject)
    },
  }
}

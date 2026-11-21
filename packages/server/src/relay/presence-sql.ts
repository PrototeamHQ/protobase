import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent, tableSql } from '../changes/capture-sql'
import type { PresenceModel } from './presence-model'
import type { PresenceChange } from './presence-report'

const columnName = (presence: PresenceModel, field: string) => presence.model.fields[field]!.column

const column = (presence: PresenceModel, field: string) => sql.raw(quoteIdent(columnName(presence, field)))

const time = (milliseconds: number) => new Date(milliseconds).toISOString()

/**
 * Writes each person's latest change in one statement, typed by the table's own row type: a record is created, or its
 * status and time replaced when the change began later than what it holds, so a report the relay sends again, or one
 * that arrives after a later one, changes nothing and raises no event.
 */
export const presenceUpsert = (presence: PresenceModel, changes: readonly PresenceChange[]) => {
  const [user, status, at] = [column(presence, presence.user), column(presence, presence.status), column(presence, presence.at)]
  const rows = changes.map((change) => ({
    [columnName(presence, presence.user)]: change.user,
    [columnName(presence, presence.status)]: change.status,
    [columnName(presence, presence.at)]: time(change.at),
  }))
  const table = sql.raw(tableSql(presence.model))
  return sql`insert into ${table} as kept (${user}, ${status}, ${at})
    select distinct on (change.${user}) change.${user}, change.${status}, change.${at}
    from jsonb_populate_recordset(null::${table}, ${JSON.stringify(rows)}::jsonb) as change
    order by change.${user}, change.${at} desc
    on conflict (${user}) do update set ${status} = excluded.${status}, ${at} = excluded.${at}
    where excluded.${at} > kept.${at}`
}

/** After the relay restarted at `started`: everyone it has not reported since, and not offline yet, is offline as of then. */
export const presenceRestart = (presence: PresenceModel, started: number) => {
  const [status, at] = [column(presence, presence.status), column(presence, presence.at)]
  return sql`update ${sql.raw(tableSql(presence.model))} set ${status} = 'offline', ${at} = ${time(started)}
    where ${at} < ${time(started)} and ${status} <> 'offline'`
}

/**
 * Records a report: its changes, then, when the relay started at another time than this process last saw, the people
 * it lost. Each statement is safe to run again, so a report the relay retries after a failure finishes the work.
 */
export const presenceWriter = (db: Db, presence: PresenceModel) => {
  // Only the latest start, so the restart's update runs once in each process for each start of the relay.
  let seen: number | undefined
  return async ({ started, changes }: { started: number; changes: readonly PresenceChange[] }) => {
    if (changes.length > 0) await presenceUpsert(presence, changes).execute(db)
    if (seen === started) return
    await presenceRestart(presence, started).execute(db)
    seen = started
  }
}

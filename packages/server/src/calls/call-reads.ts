import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { CallRemoteTrack } from '@protobase/schema/internal'
import type { CallRecord } from './call-store'

const iso = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)
const ids = (values: readonly string[]) => `{${values.join(',')}}`

/** Someone in a call now: their members row, the process that serves them, the tracks they send and the name they show. */
export type RosterMember = { row: string; member: string; process: string; joined_at: string; tracks: CallRemoteTrack[]; name: string | null }

/** Who is in each of these calls now, in the order they came; a call that ended has nobody. Unknown calls are left out. */
export const rosters = async (db: Db, calls: readonly string[]) => {
  const found = new Map<string, { ended: boolean; members: RosterMember[] }>()
  if (calls.length === 0) return found
  const { rows } = await sql<{ call: string; ended: boolean; row: string | null; member: string | null; process: string | null; joined_at: string | null; tracks: CallRemoteTrack[] | null; name: string | null }>`
    select c."id"::text as call, c."ended_at" is not null as ended, m."id"::text as row, m."member", m."process"::text as process, ${iso('m."joined_at"')} as joined_at, m."tracks", m."name"
    from "calls"."calls" c left join "calls"."members" m on m."call_id" = c."id" and m."left_at" is null
    where c."id" = any(${ids(calls)}::uuid[]) order by c."id", m."joined_at", m."id"`.execute(db)
  for (const row of rows) {
    const call = found.get(row.call) ?? { ended: row.ended, members: [] }
    found.set(row.call, call)
    if (row.row !== null) call.members.push({ row: row.row, member: row.member!, process: row.process!, joined_at: row.joined_at!, tracks: row.tracks!, name: row.name })
  }
  return found
}

/**
 * A call as the record's readers see it: who started it, when, when it ended, who is in it, with the name they show
 * when they have one, and who was removed.
 */
export type CallItem = {
  id: string
  started_by: string
  started_at: string
  /** `null` while it goes on. */
  ended_at: string | null
  members: { member: string; joined_at: string; name?: string }[]
  removed: { member: string; removed_at: string }[]
}

/** The calls kept of a record at most: the one going on and the latest that ended. */
export const recordCallsLimit = 20

/** Each record's latest calls: the one going on first, then the newest first; keyed `resource` NUL `key`. */
export const recordCalls = async (db: Db, records: readonly CallRecord[]) => {
  const found = new Map<string, CallItem[]>(records.map((record) => [recordId(record), []]))
  if (records.length === 0) return found
  const values = JSON.stringify(records.map((record) => ({ resource: record.resource, record_key: record.key })))
  const calls = await sql<{ id: string; resource: string; record_key: string; started_by: string; started_at: string; ended_at: string | null }>`
    select c."id"::text as id, c."resource", c."record_key", c."started_by", ${iso('c."started_at"')} as started_at, ${iso('c."ended_at"')} as ended_at
    from jsonb_to_recordset(${values}::jsonb) as r("resource" text, "record_key" text)
    cross join lateral (select * from "calls"."calls" k where k."resource" = r."resource" and k."record_key" = r."record_key" order by k."ended_at" is not null, k."started_at" desc, k."id" limit ${recordCallsLimit}) c
    order by c."ended_at" is not null, c."started_at" desc, c."id"`.execute(db)
  if (calls.rows.length === 0) return found
  const members = await sql<{ call: string; member: string; joined_at: string; removed_at: string | null; name: string | null }>`
    select "call_id"::text as call, "member", ${iso('"joined_at"')} as joined_at, ${iso('"removed_at"')} as removed_at, "name"
    from "calls"."members" where "call_id" = any(${ids(calls.rows.map((call) => call.id))}::uuid[]) and ("left_at" is null or "removed_at" is not null)
    order by "joined_at", "id"`.execute(db)
  const items = new Map<string, CallItem>()
  for (const call of calls.rows) {
    const item: CallItem = { id: call.id, started_by: call.started_by, started_at: call.started_at, ended_at: call.ended_at, members: [], removed: [] }
    items.set(call.id, item)
    found.get(recordId({ resource: call.resource, key: call.record_key }))!.push(item)
  }
  for (const row of members.rows) {
    const item = items.get(row.call)!
    if (row.removed_at === null) item.members.push({ member: row.member, joined_at: row.joined_at, ...(row.name !== null && { name: row.name }) })
    else item.removed.push({ member: row.member, removed_at: row.removed_at })
  }
  return found
}

/** One string for a record, for maps. */
export const recordId = ({ resource, key }: CallRecord) => `${resource}\u0000${key}`

import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { CallGuestLink, CallGuestRefusal, CallGuestState, CallLobbyGuest, CallTrackSource } from '@protobase/schema/internal'
import { writeTransaction } from '../transactions'
import { lockCall } from './call-store'
import { liveLink } from './guest-checks-sql'
import { presentMember } from './guest-links-sql'

const iso = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)

/** How long a waiting guest whose page stopped asking stays in the lobby, in seconds. */
export const waitingSeconds = 10
/** The guests that wait on one link at most. */
export const maxWaiting = 10
/** The guests a link's members may turn away before it lets nobody else wait. */
export const maxDenials = 3

/**
 * A guest waits in the lobby of the link's call, by the name they gave and the hash of the token they were given;
 * refused, the same way for each cause, when the link is unknown or no longer live, its call is over, it turned away
 * `maxDenials` guests, or `maxWaiting` already wait on it. The call's row is locked.
 */
export const enterLobby = (db: Db, timeoutMs: number, input: { link: Buffer; name: string; token: Buffer }) =>
  writeTransaction(db, timeoutMs, async (trx): Promise<{ guest: string } | { refused: 'gone' }> => {
    const found = await sql<{ id: string; call: string }>`select l."id"::text as id, l."call_id"::text as call from "calls"."guest_links" l where l."token_hash" = ${input.link} and ${liveLink('l')}`.execute(trx)
    const link = found.rows[0]
    const call = link && (await lockCall(trx, link.call))
    if (!link || !call || call.ended || call.expired) return { refused: 'gone' }
    const { rows } = await sql<{ waiting: number; denied: number }>`select count(*) filter (where "admitted" is null and "seen_at" > now() - make_interval(secs => ${waitingSeconds}))::int as waiting,
      count(*) filter (where "admitted" = false)::int as denied from "calls"."guests" where "link_id" = ${link.id}::uuid`.execute(trx)
    if (rows[0]!.waiting >= maxWaiting || rows[0]!.denied >= maxDenials) return { refused: 'gone' }
    const inserted = await sql<{ id: string }>`insert into "calls"."guests" ("id", "link_id", "call_id", "name", "token_hash", "entered_at", "seen_at")
      values (gen_random_uuid(), ${link.id}::uuid, ${call.id}::uuid, ${input.name}, ${input.token}, now(), now()) returning "id"::text as id`.execute(trx)
    return { guest: inserted.rows[0]!.id }
  })

/** What a guest's page learns of its wait: only its state, and once let in the call's id and what it may send. */
export type LobbyState = { state: CallGuestState; call?: string; publish?: CallTrackSource[] }

/** The guest's wait, by their token's hash, which tells the lobby they are still there; `undefined` for an unknown token. */
export const lobbyState = async (db: Db, token: Buffer): Promise<LobbyState | undefined> => {
  const { rows } = await sql<{ call: string; admitted: boolean | null; live: boolean; publish: CallTrackSource[] }>`
    update "calls"."guests" g set "seen_at" = now() from "calls"."guest_links" l, "calls"."calls" c
    where g."token_hash" = ${token} and l."id" = g."link_id" and c."id" = g."call_id"
    returning g."call_id"::text as call, g."admitted", (${liveLink('l')} and c."ended_at" is null and c."ends_at" > now()) as live, l."publish"`.execute(db)
  const row = rows[0]
  if (!row) return
  if (row.admitted === false) return { state: 'denied' }
  if (!row.live) return { state: 'ended' }
  if (row.admitted === null) return { state: 'waiting' }
  return { state: 'admitted', call: row.call, publish: row.publish }
}

/** A waiting guest leaves the lobby: their wait is gone. */
export const leaveLobby = async (db: Db, token: Buffer) => {
  await sql`delete from "calls"."guests" where "token_hash" = ${token} and "admitted" is null`.execute(db)
}

export type DecideInput = { call: string; guest: string; member: string; admit: boolean; maxMembers: number }

/**
 * A member in the call lets a guest waiting on one of its live links in, or turns them away; refused when the guest no
 * longer waits there, or, to let them in, when the call has no room now. The call's row is locked, so racing decisions
 * come one after the other; the guest's own join is checked against the room again.
 */
export const decideGuest = (db: Db, timeoutMs: number, input: DecideInput) =>
  writeTransaction(db, timeoutMs, async (trx): Promise<{ refused?: CallGuestRefusal }> => {
    const call = await lockCall(trx, input.call)
    if (!call || call.ended || call.expired || !(await presentMember(trx, call.id, input.member))) return { refused: 'gone' }
    const { rows } = await sql<{ id: string }>`select g."id"::text as id from "calls"."guests" g join "calls"."guest_links" l on l."id" = g."link_id"
      where g."id" = ${input.guest}::uuid and g."call_id" = ${call.id}::uuid and g."admitted" is null and ${liveLink('l')}`.execute(trx)
    if (rows.length === 0) return { refused: 'gone' }
    if (input.admit) {
      const { rows: present } = await sql<{ n: number }>`select count(*)::int as n from "calls"."members" where "call_id" = ${call.id}::uuid and "left_at" is null`.execute(trx)
      if (present[0]!.n >= input.maxMembers) return { refused: 'full' }
    }
    await sql`update "calls"."guests" set "admitted" = ${input.admit}, "decided_by" = ${input.member}, "decided_at" = now() where "id" = ${input.guest}::uuid`.execute(trx)
    return {}
  })

/** Each call's lobby, as its members who may invite see it: the guests waiting now, and its live links. */
export const lobbies = async (db: Db, calls: readonly string[]) => {
  const found = new Map<string, { guests: CallLobbyGuest[]; links: CallGuestLink[] }>(calls.map((call) => [call, { guests: [], links: [] }]))
  if (calls.length === 0) return found
  const ids = `{${calls.join(',')}}`
  const links = await sql<CallGuestLink & { call: string }>`select l."call_id"::text as call, l."id"::text as id, l."created_by", l."publish", ${iso('l."expires_at"')} as expires_at
    from "calls"."guest_links" l where l."call_id" = any(${ids}::uuid[]) and ${liveLink('l')} order by l."created_at", l."id"`.execute(db)
  for (const { call, ...link } of links.rows) found.get(call)!.links.push(link)
  const guests = await sql<CallLobbyGuest & { call: string }>`select g."call_id"::text as call, g."id"::text as guest, g."name", ${iso('g."entered_at"')} as since
    from "calls"."guests" g join "calls"."guest_links" l on l."id" = g."link_id"
    where g."call_id" = any(${ids}::uuid[]) and g."admitted" is null and g."seen_at" > now() - make_interval(secs => ${waitingSeconds}) and ${liveLink('l')}
    order by g."entered_at", g."id"`.execute(db)
  for (const { call, ...guest } of guests.rows) found.get(call)!.guests.push(guest)
  return found
}

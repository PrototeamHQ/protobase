import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { CallTrackSource } from '@protobase/schema/internal'
import type { CallRecord } from './call-store'
import { guestMember } from './guest-tokens'

/** A link that still lets guests in: not revoked, not expired, and its organization's admin did not turn guests off. */
export const liveLink = (link: string) =>
  sql.raw(`${link}."revoked_at" is null and (${link}."expires_at" is null or ${link}."expires_at" > now())
    and not exists (select from "calls"."organization_guests" o where o."organization_id" = ${link}."organization_id" and not o."allowed")`)

/**
 * Whether the guest may be in their call now: let in by a member, through a link that is still live, and not removed
 * from the call. The call's own end the caller checks under its row lock.
 */
export const guestAllowed = async (trx: Db, guest: string) => {
  const { rows } = await sql<{ id: string }>`select g."id"::text as id from "calls"."guests" g join "calls"."guest_links" l on l."id" = g."link_id"
    where g."id" = ${guest}::uuid and g."admitted" and ${liveLink('l')}
    and not exists (select from "calls"."members" m where m."call_id" = g."call_id" and m."member" = ${guestMember(guest)} and m."removed_at" is not null)`.execute(trx)
  return rows.length > 0
}

/** Whether the guest may still be in their call, the call going on: the minute's check of a guest's socket. */
export const guestStillAllowed = async (db: Db, guest: string) => {
  const { rows } = await sql<{ live: boolean }>`select c."ended_at" is null and c."ends_at" > now() as live
    from "calls"."guests" g join "calls"."calls" c on c."id" = g."call_id" where g."id" = ${guest}::uuid`.execute(db)
  return Boolean(rows[0]?.live) && (await guestAllowed(db, guest))
}

/** A guest by their token's hash: their call, its record, their name, what they may send and whether they were let in. */
export type GuestRow = { id: string; call: string; record: CallRecord; name: string; publish: CallTrackSource[]; admitted: boolean | null }

export const guestByToken = async (db: Db, hash: Buffer): Promise<GuestRow | undefined> => {
  const { rows } = await sql<{ id: string; call: string; resource: string; key: string; name: string; publish: CallTrackSource[]; admitted: boolean | null }>`
    select g."id"::text as id, g."call_id"::text as call, c."resource", c."record_key" as key, g."name", l."publish", g."admitted"
    from "calls"."guests" g join "calls"."guest_links" l on l."id" = g."link_id" join "calls"."calls" c on c."id" = g."call_id"
    where g."token_hash" = ${hash}`.execute(db)
  const row = rows[0]
  if (!row) return
  return { id: row.id, call: row.call, record: { resource: row.resource, key: row.key }, name: row.name, publish: row.publish, admitted: row.admitted }
}

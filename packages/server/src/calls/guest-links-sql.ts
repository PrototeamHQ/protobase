import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { CallGuestLink, CallGuestRefusal, CallTrackSource } from '@protobase/schema/internal'
import { writeTransaction } from '../transactions'
import { endIfEmpty, lockCall, removeMember, type CallRecord } from './call-store'
import { guestMember, isGuestMember, linkTokenPrefix, newToken, tokenHash } from './guest-tokens'

const iso = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)

/**
 * The organization a record is in, as the app keeps it: `undefined` in an app without organizations, `null` for a
 * record of a resource without a tenant in an app with them, which no admin's switch could cover.
 */
export type OrganizationOf = (trx: Db, record: CallRecord) => Promise<string | null | undefined>

/** Whether `member` is in the call now, as one of the app's members, never a guest. */
export const presentMember = async (trx: Db, call: string, member: string) =>
  !isGuestMember(member) &&
  (await sql<{ id: string }>`select "id"::text as id from "calls"."members" where "call_id" = ${call}::uuid and "member" = ${member} and "left_at" is null`.execute(trx)).rows.length > 0

const allowedIn = async (trx: Db, organization: string) =>
  (await sql<{ allowed: boolean }>`select "allowed" from "calls"."organization_guests" where "organization_id" = ${organization}`.execute(trx)).rows[0]?.allowed !== false

export type CreateLinkInput = { call: string; member: string; publish: CallTrackSource[]; expiresAt?: Date }

/**
 * A new link to the call, made by a member in it, for the organization of the call's own record, read in the
 * transaction that holds the call's row; refused when the call is over, the member is not in it, or the organization
 * turned guests off. Its token is returned once, and only its hash kept.
 */
export const createLink = (db: Db, timeoutMs: number, organizationOf: OrganizationOf, input: CreateLinkInput) =>
  writeTransaction(db, timeoutMs, async (trx): Promise<{ link: CallGuestLink; token: string } | { refused: CallGuestRefusal }> => {
    const call = await lockCall(trx, input.call)
    if (!call || call.ended || call.expired || !(await presentMember(trx, call.id, input.member))) return { refused: 'gone' }
    const organization = await organizationOf(trx, { resource: call.resource, key: call.record_key })
    if (organization === null) return { refused: 'no-organization' }
    if (organization !== undefined && !(await allowedIn(trx, organization))) return { refused: 'off' }
    const token = newToken(linkTokenPrefix)
    const { rows } = await sql<{ id: string; expires_at: string | null }>`insert into "calls"."guest_links" ("id", "call_id", "token_hash", "created_by", "organization_id", "publish", "created_at", "expires_at")
      values (gen_random_uuid(), ${call.id}::uuid, ${tokenHash(linkTokenPrefix, token)!}, ${input.member}, ${organization ?? null}, ${JSON.stringify(input.publish)}::jsonb, now(), ${input.expiresAt ?? null})
      returning "id"::text as id, ${iso('"expires_at"')} as expires_at`.execute(trx)
    const row = rows[0]!
    return { link: { id: row.id, created_by: input.member, publish: input.publish, expires_at: row.expires_at }, token }
  })

// Revokes the link, turns away its waiting guests and takes the ones it let in out of the call; the call's row is locked.
const revokeIn = async (trx: Db, call: string, link: string, by: string) => {
  await sql`update "calls"."guest_links" set "revoked_at" = now() where "id" = ${link}::uuid and "revoked_at" is null`.execute(trx)
  await sql`update "calls"."guests" set "admitted" = false, "decided_by" = ${by}, "decided_at" = now() where "link_id" = ${link}::uuid and "admitted" is null`.execute(trx)
  const { rows } = await sql<{ id: string }>`select "id"::text as id from "calls"."guests" where "link_id" = ${link}::uuid and "admitted"`.execute(trx)
  for (const guest of rows) await removeMember(trx, call, guestMember(guest.id))
  await endIfEmpty(trx, call)
}

/** A member in the call revokes one of its links: its guests are out. Whether it was the call's and still live. */
export const revokeLink = (db: Db, timeoutMs: number, input: { call: string; link: string; member: string }) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    const call = await lockCall(trx, input.call)
    if (!call || call.ended || !(await presentMember(trx, call.id, input.member))) return false
    const { rows } = await sql<{ id: string }>`select "id"::text as id from "calls"."guest_links" where "id" = ${input.link}::uuid and "call_id" = ${call.id}::uuid and "revoked_at" is null`.execute(trx)
    if (rows.length === 0) return false
    await revokeIn(trx, call.id, input.link, input.member)
    return true
  })

/**
 * Whether the organization's admin allows guest links to its calls. Turning them off revokes every live link of the
 * organization at once, each under its call's row lock in the order of the calls, and takes their guests out: the
 * calls it changed.
 */
export const setOrganizationGuests = (db: Db, timeoutMs: number, input: { organization: string; allowed: boolean; by: string }) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    await sql`insert into "calls"."organization_guests" ("organization_id", "allowed", "set_by", "set_at") values (${input.organization}, ${input.allowed}, ${input.by}, now())
      on conflict ("organization_id") do update set "allowed" = excluded."allowed", "set_by" = excluded."set_by", "set_at" = excluded."set_at"`.execute(trx)
    if (input.allowed) return []
    const { rows } = await sql<{ id: string; call: string }>`select "id"::text as id, "call_id"::text as call from "calls"."guest_links"
      where "organization_id" = ${input.organization} and "revoked_at" is null order by "call_id", "id"`.execute(trx)
    const calls = new Set<string>()
    for (const link of rows) {
      const call = await lockCall(trx, link.call)
      if (!call || call.ended) continue
      await revokeIn(trx, call.id, link.id, input.by)
      calls.add(call.id)
    }
    return [...calls]
  })

/** Whether the organization allows guest links: yes until its admin turned them off. */
export const organizationGuests = (db: Db, organization: string) => allowedIn(db, organization)

import { sql } from 'kysely'
import type { StoreSql } from '../../better-auth/store/store-sql'
import type { VerificationOutcome } from './sender-address-verifier'
import { checkIntervalMs, maxPendingMs, maxValidMs, verificationExpired, verifyLeaseMs } from './verification-outcome'

/** A verification as the app reads it back: never its secret's hash. */
export type VerificationRow = {
  id: string
  senderId: string
  verifier: string
  state: 'pending' | 'verified' | 'failed'
  createdAt: Date
  expiresAt: Date
  settledAt: Date | null
  validUntil: Date | null
  errorCode: string | null
  error: string | null
}

/** A verification the sweep claimed, with the address it proves. */
export type ClaimedVerification = { id: string; verifier: string; address: string; name: string | null }

/** A verified verification that still counts, by the address it proves. */
export type SenderProof = { senderId: string; settledAt: Date }

/** Which verification an outcome settles: by its id, from the app's own code; by its secret's hash, from a report. */
export type SettleKey = { id: string } | { secretHash: string }

const interval = (ms: number) => sql.raw(`interval '${ms / 1000} seconds'`)

const parts = (store: StoreSql) => {
  const table = store.table('mail_sender_verification')
  const v = table.columns
  const sender = store.table('mail_sender')
  // Each column with its table, as the reads join the addresses, which have columns of the same names.
  const selected = sql.join([
    sql`${table}.id`,
    sql`${table}.${v.sender_id} as "senderId"`,
    sql`${table}.${v.verifier} as verifier`,
    sql`${table}.${v.state} as state`,
    sql`${table}.${v.created_at} as "createdAt"`,
    sql`${table}.${v.expires_at} as "expiresAt"`,
    sql`${table}.${v.settled_at} as "settledAt"`,
    sql`${table}.${v.valid_until} as "validUntil"`,
    sql`${table}.${v.error_code} as "errorCode"`,
    sql`${table}.${v.error} as error`,
  ])
  return { table, v, sender, s: sender.columns, selected }
}

/**
 * The verifications in SQL, on the auth store, each call one statement. Every settle is one update guarded by
 * `state = 'pending' and expires_at > now()`, so a verification settles once, whichever of `verify`, the sweep and a
 * report comes first, and none after it expired.
 */
export const verificationStore = (store: () => Promise<StoreSql>) => ({
  /** Fails, as expired, the pending verification of `senderId` by `verifier` whose time ran out, a `verify` that never returned included. */
  expireOverdue: async (senderId: string, verifier: string) => {
    const s = await store()
    const { table, v } = parts(s)
    await sql`update ${table} set ${v.state} = 'failed', ${v.settled_at} = now(), ${v.error_code} = ${verificationExpired}
where ${v.sender_id} = ${senderId} and ${v.verifier} = ${verifier} and ${v.state} = 'pending' and ${v.expires_at} <= now()`.execute(s.db)
  },

  /** Starts a verification of `senderId` by `verifier`, pending for the lease `verify` has: its id, or none while one is pending already. */
  start: async (senderId: string, verifier: string, secretHash: string) => {
    const s = await store()
    const { table, v } = parts(s)
    const { rows } = await sql<{ id: string }>`insert into ${table} (id, ${v.sender_id}, ${v.verifier}, ${v.state}, ${v.secret_hash}, ${v.created_at}, ${v.expires_at}, ${v.next_check_at})
values (${s.newId}, ${senderId}, ${verifier}, 'pending', ${secretHash}, now(), now() + ${interval(verifyLeaseMs)}, now() + ${interval(verifyLeaseMs)})
on conflict (${v.sender_id}, ${v.verifier}) where ${v.state} = 'pending' do nothing
returning id`.execute(s.db)
    return rows[0]?.id
  },

  /**
   * Records `outcome` of the verification `key` names, if `verifier` started it and it is still pending in time:
   * whether it did. The first pending outcome (`first`) sets when it expires, at most 24 hours after it started; a
   * later one only when it is checked next, a minute on at the soonest and never after it expires. `valid_until` counts at most 28 days.
   */
  settle: async (key: SettleKey, verifier: string, outcome: VerificationOutcome, first = false) => {
    const s = await store()
    const { table, v } = parts(s)
    const set = (() => {
      if (outcome.state === 'verified') return sql`${v.state} = 'verified', ${v.settled_at} = now(), ${v.valid_until} = least(${outcome.valid_until}::timestamptz, now() + ${interval(maxValidMs)})`
      if (outcome.state === 'failed') return sql`${v.state} = 'failed', ${v.settled_at} = now(), ${v.error_code} = ${outcome.error_code}, ${v.error} = ${outcome.error ?? null}`
      // Never sooner than the fixed interval: a check_after in the past would make the row due again at once, and keep a sweep reclaiming it.
      const interval_ = sql`now() + ${interval(checkIntervalMs)}`
      const nextCheck = outcome.check_after ? sql`greatest(${outcome.check_after}::timestamptz, ${interval_})` : interval_
      if (!first) return sql`${v.next_check_at} = least(${nextCheck}, ${v.expires_at})`
      const expires = sql`least(${outcome.expires_at!}::timestamptz, ${v.created_at} + ${interval(maxPendingMs)})`
      return sql`${v.expires_at} = ${expires}, ${v.next_check_at} = least(${nextCheck}, ${expires})`
    })()
    const match = 'id' in key ? sql`id = ${key.id}` : sql`${v.secret_hash} = ${key.secretHash}`
    const { rows } = await sql<{ id: string }>`update ${table} set ${set}
where ${match} and ${v.verifier} = ${verifier} and ${v.state} = 'pending' and ${v.expires_at} > now()
returning id`.execute(s.db)
    return rows.length === 1
  },

  /** Fails, as expired, every pending verification whose time ran out, of any verifier. */
  expireDue: async () => {
    const s = await store()
    const { table, v } = parts(s)
    await sql`update ${table} set ${v.state} = 'failed', ${v.settled_at} = now(), ${v.error_code} = ${verificationExpired}
where ${v.state} = 'pending' and ${v.expires_at} <= now()`.execute(s.db)
  },

  /**
   * Claims up to `limit` pending verifications of `verifiers` due for a check, moving their next check a minute on as
   * it claims them: a sweep running beside this one skips them, as they are locked, and then finds them not due.
   */
  claimDue: async (verifiers: readonly string[], limit: number) => {
    const s = await store()
    const { table, v, sender, s: c } = parts(s)
    // Returned in a fixed order, so the checks run in the same order each time.
    const { rows } = await sql<ClaimedVerification>`with claimed as (
update ${table} set ${v.next_check_at} = now() + ${interval(checkIntervalMs)}
from ${sender}
where ${table}.id in (
  select id from ${table}
  where ${v.state} = 'pending' and ${v.next_check_at} <= now() and ${v.expires_at} > now() and ${v.verifier} = any(${[...verifiers]}::text[])
  order by ${v.next_check_at} limit ${limit}
  for update skip locked
) and ${sender}.id = ${table}.${v.sender_id}
returning ${table}.id, ${table}.${v.verifier} as verifier, ${sender}.${c.address} as address, ${sender}.${c.name} as name
)
select * from claimed order by address, verifier`.execute(s.db)
    return rows
  },

  /** The latest verification of each of `userId`'s addresses by each of `verifiers`. */
  latestOf: async (userId: string, verifiers: readonly string[]) => {
    if (verifiers.length === 0) return []
    const s = await store()
    const { table, v, sender, s: c, selected } = parts(s)
    // Oldest first, as the addresses list: the ids are random, so an order by them would change from read to read of the same rows.
    const { rows } = await sql<VerificationRow>`select * from (
  select distinct on (${table}.${v.sender_id}, ${table}.${v.verifier}) ${selected} from ${table}
  join ${sender} on ${sender}.id = ${table}.${v.sender_id}
  where ${sender}.${c.user_id} = ${userId} and ${table}.${v.verifier} = any(${[...verifiers]}::text[])
  order by ${table}.${v.sender_id}, ${table}.${v.verifier}, ${table}.${v.created_at} desc
) as latest order by "createdAt", verifier`.execute(s.db)
    return rows
  },

  /** The verified verifications by `verifiers` of `userId`'s addresses that still count. */
  proofsOf: async (userId: string, verifiers: readonly string[]) => {
    if (verifiers.length === 0) return []
    const s = await store()
    const { table, v, sender, s: c } = parts(s)
    const { rows } = await sql<SenderProof>`select ${table}.${v.sender_id} as "senderId", max(${table}.${v.settled_at}) as "settledAt" from ${table}
join ${sender} on ${sender}.id = ${table}.${v.sender_id}
where ${sender}.${c.user_id} = ${userId} and ${table}.${v.verifier} = any(${[...verifiers]}::text[]) and ${table}.${v.state} = 'verified' and ${table}.${v.valid_until} > now()
group by ${table}.${v.sender_id}
order by "settledAt"`.execute(s.db)
    return rows
  },
})

export type VerificationStore = ReturnType<typeof verificationStore>

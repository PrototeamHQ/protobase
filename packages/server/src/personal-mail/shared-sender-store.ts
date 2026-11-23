import { sql } from 'kysely'
import type { StoreSql } from '../better-auth/store/store-sql'
import type { SharedSenderReader, SharedSenderRow } from './sender-store'

export type { SharedSenderReader, SharedSenderRow }

type Reach = {
  /** Whether the app has organizations: then only addresses of owners who share one with the person are in reach. */
  organizations: boolean
  /** The app's verifiers, whose proofs count. */
  verifiers: readonly string[]
}

/**
 * The shared addresses in SQL, on the auth store: one query, which the shared addresses' partial index on their owner
 * serves, joined with the owner's account and, with `organizations`, filtered to owners in an organization of the
 * person's. Its rows carry no state: `sharedState` derives it, as for the owner's own addresses.
 */
export const sharedSenderReader =
  (store: () => Promise<StoreSql>, { organizations, verifiers }: Reach): SharedSenderReader =>
  async (userId, id) => {
    const s = await store()
    const sender = s.table('mail_sender')
    const c = sender.columns
    const account = s.table('account')
    const a = account.columns
    const verification = s.table('mail_sender_verification')
    const v = verification.columns
    const member = organizations ? s.table('member') : undefined
    const proved =
      verifiers.length === 0
        ? sql`null::timestamptz`
        : sql`(select max(${v.settled_at}) from ${verification} where ${v.sender_id} = ${sender}.id and ${v.verifier} = any(${[...verifiers]}::text[]) and ${v.state} = 'verified' and ${v.valid_until} > now())`
    const inReach = member
      ? sql`and ${sender}.${c.user_id} in (select theirs.${member.columns.user_id} from ${member} as mine join ${member} as theirs on theirs.${member.columns.organization_id} = mine.${member.columns.organization_id} where mine.${member.columns.user_id} = ${userId})`
      : sql``
    const named = id === undefined ? sql`` : sql`and ${sender}.id = ${id}`
    const { rows } = await sql<SharedSenderRow>`select ${sender}.id, ${sender}.${c.user_id} as "userId", ${sender}.${c.connection_id} as "connectionId", ${sender}.${c.address} as address,
  ${sender}.${c.name} as name, ${sender}.${c.shared_at} as "sharedAt", ${sender}.${c.signature} as signature, false as "isDefault", ${sender}.${c.created_at} as "createdAt",
  ${sender}.${c.typed_at} as "typedAt", ${sender}.${c.listed_at} as "listedAt", ${sender}.${c.provider_state} as "providerState",
  ${sender}.${c.provider_state_read_at} as "providerStateReadAt", ${sender}.${c.removed_at} as "removedAt",
  case when ${account}.id is null then null else json_build_object('id', ${account}.id, 'providerId', ${account}.${a.provider_id}, 'scope', ${account}.${a.scope}, 'createdAt', ${account}.${a.created_at}) end as account,
  ${proved} as "provedAt"
from ${sender}
left join ${account} on ${account}.id = ${sender}.${c.connection_id} and ${account}.${a.user_id} = ${sender}.${c.user_id}
where ${sender}.${c.shared_at} is not null and ${sender}.${c.user_id} <> ${userId} ${named} ${inReach}
order by ${sender}.${c.created_at}, ${sender}.${c.address_key}, ${sender}.id`.execute(s.db)
    return rows.map((row) => ({ ...row, account: row.account && { ...row.account, createdAt: new Date(row.account.createdAt) } }))
  }

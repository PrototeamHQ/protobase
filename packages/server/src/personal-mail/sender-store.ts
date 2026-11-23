import { sql } from 'kysely'
import type { StoreSql } from '../better-auth/store/store-sql'
import type { ProviderAddressState } from './personal-mail-provider'
import type { SenderProof } from './verifiers/verification-store'

/** Better Auth's model for the From addresses people send as: one row per mailbox connection and address. */
export const mailSenderModel = 'mailSender'

/**
 * A From address of `userId`'s, in lowercase, on the mailbox connection `connectionId` it goes out through, none when
 * it was entered before connections were recorded and its owner had not exactly one, or the connection is gone. Its
 * display name, own signature and whether it is the owner's default are the owner's. What vouches for it has one
 * writer each: `typedAt` when its owner typed it; `listedAt`, `providerState` and `providerStateReadAt` from the
 * provider's last complete listing of the connection, `listedAt` empty when that listing did not hold it; `removedAt`
 * when its owner removed it. `shared` stays false: sharing waits until the owner can prove the address is theirs.
 */
export type MailSenderRow = {
  id: string
  userId: string
  connectionId: string | null
  address: string
  name: string | null
  shared: boolean
  signature: string | null
  isDefault: boolean
  createdAt: Date
  typedAt: Date | null
  listedAt: Date | null
  providerState: string | null
  providerStateReadAt: Date | null
  removedAt: Date | null
}

/** An address as its owner types it, on the connection it goes out through. */
export type TypedSender = { userId: string; connectionId: string; address: string; name: string | null; signature: string | null }

/** An address as a provider's complete listing names it. */
export type ListedSender = { address: string; provider_state?: ProviderAddressState }

/** The person's changes to an address of theirs. */
export type SenderChange = Partial<Pick<MailSenderRow, 'name' | 'signature' | 'isDefault'>>

/** Where the From addresses live: each call acts on `userId`'s own rows alone. */
export type MailSenderStore = {
  /** Every row of the person's, removed ones included, oldest first, and those made at once by address. */
  ofUser: (userId: string) => Promise<MailSenderRow[]>
  /**
   * Records that the person typed `sender` at `at`: a new row, or on the row of its connection and address, its
   * `typedAt`, name and signature, leaving what the provider listed and the row's id as they were. Typed again after
   * its owner removed it, it is typed after the removal, even within the same millisecond.
   */
  type: (sender: TypedSender, at: Date) => Promise<MailSenderRow>
  /**
   * Records the provider's complete listing of `connectionId`, asked for at `readAt`: each listed address with what
   * the provider says of it, a new row for one not there yet; each other row of the connection known by then as not
   * listed. A row a later listing already read keeps what that one said, so two listings that finish out of order
   * leave the later one's word. It never deletes a row, changes an id, or touches what the person typed or removed.
   */
  recordListing: (userId: string, connectionId: string, listed: ListedSender[], readAt: Date) => Promise<void>
  change: (userId: string, id: string, change: SenderChange) => Promise<MailSenderRow | undefined>
  /** Makes none of the person's addresses their default. */
  clearDefault: (userId: string) => Promise<void>
  /** Records that the person removed the address `id` at `at`; it is their default no longer. */
  remove: (userId: string, id: string, at: Date) => Promise<void>
  /** What the app's verifiers proved of the person's addresses, when it has any (see `verificationStore`). */
  proofsOf?: (userId: string) => Promise<SenderProof[]>
}

const columns = (store: StoreSql) => {
  const table = store.table('mail_sender')
  const c = table.columns
  const selected = sql.join([
    sql`id`,
    sql`${c.user_id} as "userId"`,
    sql`${c.connection_id} as "connectionId"`,
    sql`${c.address} as address`,
    sql`${c.name} as name`,
    sql`${c.shared} as shared`,
    sql`${c.signature} as signature`,
    sql`${c.is_default} as "isDefault"`,
    sql`${c.created_at} as "createdAt"`,
    sql`${c.typed_at} as "typedAt"`,
    sql`${c.listed_at} as "listedAt"`,
    sql`${c.provider_state} as "providerState"`,
    sql`${c.provider_state_read_at} as "providerStateReadAt"`,
    sql`${c.removed_at} as "removedAt"`,
  ])
  return { table, c, selected }
}

/**
 * The store in SQL, on the auth store: each statement is one query, which the person's rows' key or the connection
 * and address index serves. Typing and listing write disjoint columns of one row with `on conflict`, so a typed
 * address and a listing at the same moment both keep what they wrote.
 */
export const sqlSenderStore = (store: () => Promise<StoreSql>): MailSenderStore => ({
  ofUser: async (userId) => {
    const s = await store()
    const { table, c, selected } = columns(s)
    const { rows } = await sql<MailSenderRow>`select ${selected} from ${table} where ${c.user_id} = ${userId} order by ${c.created_at}, ${c.address_key}, id`.execute(s.db)
    return rows
  },

  type: async (sender, at) => {
    const s = await store()
    const { table, c, selected } = columns(s)
    const { rows } = await sql<MailSenderRow>`insert into ${table} (id, ${c.user_id}, ${c.connection_id}, ${c.address}, ${c.name}, ${c.shared}, ${c.signature}, ${c.is_default}, ${c.created_at}, ${c.typed_at})
values (${s.newId}, ${sender.userId}, ${sender.connectionId}, ${sender.address}, ${sender.name}, false, ${sender.signature}, false, ${at}, ${at})
on conflict (${c.connection_id}, ${c.address_key}) do update set ${c.typed_at} = greatest(excluded.${c.typed_at}, ${table}.${c.removed_at} + interval '1 millisecond'), ${c.name} = excluded.${c.name}, ${c.signature} = excluded.${c.signature}
returning ${selected}`.execute(s.db)
    return rows[0]!
  },

  recordListing: async (userId, connectionId, listed, readAt) => {
    const s = await store()
    const { table, c } = columns(s)
    const addresses = listed.map(({ address }) => address)
    const states = listed.map(({ provider_state }) => provider_state ?? null)
    await sql`with listed (address, state) as (select * from unnest(${addresses}::text[], ${states}::text[])),
upserted as (
  insert into ${table} (id, ${c.user_id}, ${c.connection_id}, ${c.address}, ${c.shared}, ${c.is_default}, ${c.created_at}, ${c.listed_at}, ${c.provider_state}, ${c.provider_state_read_at})
  select ${s.newId}, ${userId}, ${connectionId}, listed.address, false, false, ${readAt}, ${readAt}, listed.state, ${readAt} from listed
  on conflict (${c.connection_id}, ${c.address_key}) do update set ${c.listed_at} = excluded.${c.listed_at}, ${c.provider_state} = excluded.${c.provider_state}, ${c.provider_state_read_at} = excluded.${c.provider_state_read_at}
  where ${table}.${c.provider_state_read_at} is null or ${table}.${c.provider_state_read_at} <= excluded.${c.provider_state_read_at}
  returning id
)
update ${table} set ${c.listed_at} = null, ${c.provider_state} = null, ${c.provider_state_read_at} = ${readAt}
where ${c.connection_id} = ${connectionId} and ${c.user_id} = ${userId} and ${c.address_key} <> all(${addresses}::text[]) and coalesce(${c.typed_at}, ${c.created_at}) <= ${readAt}
  and (${c.provider_state_read_at} is null or ${c.provider_state_read_at} <= ${readAt})`.execute(s.db)
  },

  change: async (userId, id, change) => {
    const s = await store()
    const { table, c, selected } = columns(s)
    const set = [
      ...(change.name !== undefined ? [sql`${c.name} = ${change.name}`] : []),
      ...(change.signature !== undefined ? [sql`${c.signature} = ${change.signature}`] : []),
      ...(change.isDefault !== undefined ? [sql`${c.is_default} = ${change.isDefault}`] : []),
    ]
    if (set.length === 0) return (await sqlSenderStore(store).ofUser(userId)).find((row) => row.id === id)
    const { rows } = await sql<MailSenderRow>`update ${table} set ${sql.join(set)} where id = ${id} and ${c.user_id} = ${userId} returning ${selected}`.execute(s.db)
    return rows[0]
  },

  clearDefault: async (userId) => {
    const s = await store()
    const { table, c } = columns(s)
    await sql`update ${table} set ${c.is_default} = false where ${c.user_id} = ${userId} and ${c.is_default}`.execute(s.db)
  },

  remove: async (userId, id, at) => {
    const s = await store()
    const { table, c } = columns(s)
    await sql`update ${table} set ${c.removed_at} = ${at}, ${c.is_default} = false where id = ${id} and ${c.user_id} = ${userId}`.execute(s.db)
  },
})

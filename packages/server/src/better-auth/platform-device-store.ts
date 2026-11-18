import { sql } from 'kysely'
import type { AuthContext } from './organizations/store'
import { storeSqlOf } from './store/store-sql'

/** What a device store query needs of Better Auth's context: its options and the store's names. */
export type DeviceStoreContext = Pick<AuthContext, 'options'>

/** A device account of the person, with the tokens of the sessions it began, as one row of `deviceLinkRows`. */
export type DeviceLinkRow = { id: string; providerId: string; idToken: string | null; createdAt: Date; sessions: string[] }

/**
 * The person's accounts of the device `providers`, oldest first, each with the tokens of every session it began: one
 * query, which the user's accounts' index, `device_session_account_id_idx` and the sessions' key serve. A device
 * session names its account as text, also in a store whose ids are uuids, so the account's id is compared as text.
 */
export const deviceLinkRows = async (context: DeviceStoreContext, userId: string, providers: string[]) => {
  const store = storeSqlOf(context)
  const account = store.table('account')
  const a = account.columns
  const device = store.table('device_session')
  const d = device.columns
  const session = store.table('session')
  const s = session.columns
  const { rows } = await sql<DeviceLinkRow>`select a.id, a.${a.provider_id} as "providerId", a.${a.id_token} as "idToken", a.${a.created_at} as "createdAt",
  coalesce(array_agg(s.${s.token} order by s.${s.created_at}) filter (where s.${s.token} is not null), '{}') as sessions
from ${account} a
left join ${device} d on d.${d.account_id} = a.id::text
left join ${session} s on s.id = d.${d.session_id}
where a.${a.user_id} = ${userId} and a.${a.provider_id} in (${sql.join(providers)})
group by a.id
order by a.${a.created_at}, a.id`.execute(store.db)
  return rows
}

/**
 * Ends every session the device account `accountId` began, however many, in one statement that
 * `device_session_account_id_idx` serves; their `device_session` rows go with them. Ending a session needs nothing
 * else: its cookie and tokens are refused once its row is gone.
 */
export const endDeviceSessions = async (context: DeviceStoreContext, accountId: string) => {
  const store = storeSqlOf(context)
  const device = store.table('device_session')
  const { session_id, account_id } = device.columns
  await sql`delete from ${store.table('session')} s using ${device} d where d.${session_id} = s.id and d.${account_id} = ${accountId}`.execute(store.db)
}

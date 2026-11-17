import { sql } from 'kysely'
import { storeDb } from './store/store-db'
import { storeSchema, storeTable, type StoreOptions } from './store/store-names'

/** What a device store query needs of Better Auth's context: the store's database options. */
export type DeviceStoreContext = StoreOptions

/** A device account of the person, with the tokens of the sessions it began, as one row of `deviceLinkRows`. */
export type DeviceLinkRow = { id: string; providerId: string; idToken: string | null; createdAt: Date; sessions: string[] }

/**
 * The person's accounts of the device `providers`, oldest first, each with the tokens of every session it began: one
 * query, which the user's accounts' index, `device_session_account_id_idx` and the sessions' key serve.
 */
export const deviceLinkRows = async (context: DeviceStoreContext, userId: string, providers: string[]) => {
  const names = { schema: storeSchema(context) }
  const { rows } = await sql<DeviceLinkRow>`select a.id, a.provider_id as "providerId", a.id_token as "idToken", a.created_at as "createdAt",
  coalesce(array_agg(s.token order by s.created_at) filter (where s.token is not null), '{}') as sessions
from ${storeTable(names, 'account')} a
left join ${storeTable(names, 'device_session')} d on d.account_id = a.id
left join ${storeTable(names, 'session')} s on s.id = d.session_id
where a.user_id = ${userId} and a.provider_id in (${sql.join(providers)})
group by a.id
order by a.created_at, a.id`.execute(storeDb(context))
  return rows
}

/**
 * Ends every session the device account `accountId` began, however many, in one statement that
 * `device_session_account_id_idx` serves; their `device_session` rows go with them. Ending a session needs nothing
 * else: its cookie and tokens are refused once its row is gone.
 */
export const endDeviceSessions = async (context: DeviceStoreContext, accountId: string) => {
  const names = { schema: storeSchema(context) }
  await sql`delete from ${storeTable(names, 'session')} s using ${storeTable(names, 'device_session')} d where d.session_id = s.id and d.account_id = ${accountId}`.execute(storeDb(context))
}

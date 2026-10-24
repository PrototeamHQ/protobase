import { sql, type RawBuilder } from 'kysely'
import type { Db } from '@protobase/query'
import { isDatabaseError } from '../error-handler'
import type { Device } from './device'
import { required, type DeviceStore } from './device-store'
import { deviceColumns, notificationsNames, type DeviceColumn, type NotificationsOptions } from './options'

/**
 * A database error of the device store, holding its SQLSTATE alone: the driver's own carries the failing row in its
 * detail, tokens and keys included, which must never reach a log.
 */
export class DeviceStoreError extends Error {
  constructor(readonly sqlState: string) {
    super(`The device store's query failed (SQLSTATE ${sqlState})`)
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DeviceRow = Record<DeviceColumn, unknown>

const deviceOf = (row: DeviceRow): Device => ({
  id: String(row.id),
  userId: String(row.user_id),
  kind: row.kind as Device['kind'],
  token: row.token as string,
  p256dh: row.p256dh as string | null,
  auth: row.auth as string | null,
  environment: row.environment as Device['environment'],
  appId: row.app_id as string | null,
  userAgent: row.user_agent as string | null,
  createdAt: new Date(row.created_at as Date),
  lastSeenAt: new Date(row.last_seen_at as Date),
})

/** The default device store: the devices table `protobase migration` writes, under the names the options give. */
export const postgresDeviceStore = (db: Db, options: NotificationsOptions = {}): DeviceStore => {
  const { schema, table, columns } = notificationsNames(options)
  const devices = sql.id(schema, table)
  const column = (name: DeviceColumn) => sql.id(columns[name])
  // Each column under the name Protobase gives it.
  const selected = sql.join(deviceColumns.map((name) => sql`${column(name)} as ${sql.id(name)}`))
  const execute = <R>(query: RawBuilder<R>) =>
    query.execute(db).catch((error: unknown) => {
      if (isDatabaseError(error)) throw new DeviceStoreError(error.code)
      throw error
    })
  const rows = async (query: RawBuilder<DeviceRow>) => (await execute(query)).rows.map(deviceOf)

  return {
    register: async (userId, device) => {
      required('user id', userId)
      required('token', device.token)
      const now = new Date()
      const values = { id: crypto.randomUUID(), user_id: userId, kind: device.kind, token: device.token, p256dh: device.p256dh, auth: device.auth, environment: device.environment, app_id: device.appId, user_agent: device.userAgent, created_at: now, last_seen_at: now }
      const names = sql.join(deviceColumns.map(column))
      const given = sql.join(deviceColumns.map((name) => sql`${values[name]}`))
      const sameUser = sql`${sql.ref(`d.${columns.user_id}`)} = excluded.${column('user_id')}`
      // A token another user held moves as a new device: a new id and created now. The user's own keeps both.
      const keep = (name: DeviceColumn) => sql`${column(name)} = case when ${sameUser} then ${sql.ref(`d.${columns[name]}`)} else excluded.${column(name)} end`
      const replaced = (['user_id', 'kind', 'p256dh', 'auth', 'environment', 'app_id', 'user_agent', 'last_seen_at'] as const).map((name) => sql`${column(name)} = excluded.${column(name)}`)
      const [stored] = await rows(sql<DeviceRow>`insert into ${devices} as d (${names}) values (${given})
        on conflict (${column('token')}) do update set ${sql.join([keep('id'), keep('created_at'), ...replaced])}
        returning ${selected}`)
      return stored!
    },
    remove: async (userId, id) => {
      required('user id', userId)
      required('device id', id)
      if (!uuidPattern.test(id)) return
      await execute(sql`delete from ${devices} where ${column('user_id')} = ${userId} and ${column('id')} = ${id}`)
    },
    listForUser: async (userId) => {
      required('user id', userId)
      return rows(sql<DeviceRow>`select ${selected} from ${devices} where ${column('user_id')} = ${userId} order by ${column('last_seen_at')} desc`)
    },
    listByIds: async (ids) => {
      const valid = ids.map((id) => required('device id', id)).filter((id) => uuidPattern.test(id))
      if (valid.length === 0) return []
      return rows(sql<DeviceRow>`select ${selected} from ${devices} where ${column('id')} = any(${valid}::uuid[])`)
    },
    removeGone: async (tokens) => {
      const given = tokens.map((token) => required('token', token))
      if (given.length === 0) return
      await execute(sql`delete from ${devices} where ${column('token')} = any(${given}::text[])`)
    },
    removeAllForUser: async (userId) => {
      required('user id', userId)
      await execute(sql`delete from ${devices} where ${column('user_id')} = ${userId}`)
    },
  }
}

import { checkDeviceStore, type DeviceStore } from './device-store'

/** The columns of the devices table, by the name Protobase gives them. */
export const deviceColumns = ['id', 'user_id', 'kind', 'token', 'p256dh', 'auth', 'environment', 'app_id', 'user_agent', 'created_at', 'last_seen_at'] as const
export type DeviceColumn = (typeof deviceColumns)[number]

/** Notifications, turned on with `extends: [notifications()]`. */
export type NotificationsOptions = {
  /** The bell in the top bar; default true. `false` keeps only the backend. */
  ui?: boolean
  /** The schema of the built-in tables; default `notifications`. */
  schema?: string
  /** The devices table: its name, default `devices`, and its columns named otherwise than Protobase names them. */
  devices?: { table?: string; columns?: Partial<Record<DeviceColumn, string>> }
  /** Keeps the devices somewhere else than the devices table, which is then not needed. */
  store?: DeviceStore
}

const namePattern = /^[a-z_][a-z0-9_]*$/
// Postgres keeps the first 63 bytes of a name.
const maxNameBytes = 63

const checkedName = (option: string, name: string) => {
  if (typeof name !== 'string' || !namePattern.test(name) || Buffer.byteLength(name) > maxNameBytes) {
    throw new Error(`notifications ${option} is not a valid name: use lowercase letters, digits and "_", at most ${maxNameBytes} characters`)
  }
  return name
}

/** The built-in tables' names, checked: a bad or unknown name is an error naming its option. */
export const notificationsNames = (options: NotificationsOptions = {}) => {
  const given = options.devices?.columns ?? {}
  const unknown = Object.keys(given).find((name) => !(deviceColumns as readonly string[]).includes(name))
  if (unknown !== undefined) throw new Error(`notifications devices.columns names "${unknown}", which is not a column of the devices table: ${deviceColumns.join(', ')}`)
  const columns = Object.fromEntries(deviceColumns.map((column) => [column, checkedName(`devices.columns.${column}`, given[column] ?? column)])) as Record<DeviceColumn, string>
  return {
    schema: checkedName('schema', options.schema ?? 'notifications'),
    table: checkedName('devices.table', options.devices?.table ?? 'devices'),
    columns,
  }
}

export type NotificationsNames = ReturnType<typeof notificationsNames>

/** The options, checked as `notifications()` takes them: the names, and a given store's methods. */
export const checkNotificationsOptions = (options: NotificationsOptions) => {
  if (options.ui !== undefined && typeof options.ui !== 'boolean') throw new Error('notifications ui is true or false')
  notificationsNames(options)
  if (options.store !== undefined) checkDeviceStore(options.store)
  return options
}

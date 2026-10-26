import { checkDeviceStore, type DeviceStore } from './device-store'
import { checkHistoryStore, type HistoryStore } from './history-store'
import { checkSenders, type PushSender } from './sender'

/** The columns of the devices table, by the name Protobase gives them. */
export const deviceColumns = ['id', 'user_id', 'kind', 'token', 'p256dh', 'auth', 'environment', 'app_id', 'user_agent', 'session_id', 'created_at', 'last_seen_at'] as const
export type DeviceColumn = (typeof deviceColumns)[number]

/** The columns of the history table, by the name Protobase gives them. */
export const historyColumns = ['id', 'user_id', 'title', 'body', 'url', 'data', 'created_at', 'read_at'] as const
export type HistoryColumn = (typeof historyColumns)[number]

/** Notifications, turned on with `notifications: {}` in `protobase.config.ts`. */
export type NotificationsOptions = {
  /** The bell in the top bar; default true. `false` keeps only the backend. */
  ui?: boolean
  /** The schema of the built-in tables; default `notifications`. */
  schema?: string
  /** The devices table: its name, default `devices`, and its columns named otherwise than Protobase names them. */
  devices?: { table?: string; columns?: Partial<Record<DeviceColumn, string>> }
  /** Keeps the devices somewhere else than the devices table, which is then not needed. */
  store?: DeviceStore
  /** The history table: its name, default `history`, and its columns named otherwise than Protobase names them. */
  history?: { table?: string; columns?: Partial<Record<HistoryColumn, string>> }
  /** Keeps each user's notification history somewhere else than the history table, which is then not needed. */
  historyStore?: HistoryStore
  /**
   * Deliver notifications in place of the built-in senders, such as senders from a package; at most one for each kind
   * of device. By default the built-in ones whose environment is set: Web Push with the `PROTOBASE_VAPID_*` variables.
   */
  senders?: PushSender[]
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

// Each column under its configured name, checked; a key that is no column of the table is an error naming it.
const columnNames = <C extends string>(table: string, all: readonly C[], given: Partial<Record<C, string>> = {}) => {
  const unknown = Object.keys(given).find((name) => !(all as readonly string[]).includes(name))
  if (unknown !== undefined) throw new Error(`notifications ${table}.columns names "${unknown}", which is not a column of the ${table} table: ${all.join(', ')}`)
  return Object.fromEntries(all.map((column) => [column, checkedName(`${table}.columns.${column}`, given[column] ?? column)])) as Record<C, string>
}

/** The devices table's names, checked: a bad or unknown name is an error naming its option. */
export const notificationsNames = (options: NotificationsOptions = {}) => ({
  schema: checkedName('schema', options.schema ?? 'notifications'),
  table: checkedName('devices.table', options.devices?.table ?? 'devices'),
  columns: columnNames('devices', deviceColumns, options.devices?.columns),
})

/** The history table's names, checked as the devices table's are. */
export const historyNames = (options: NotificationsOptions = {}) => ({
  schema: checkedName('schema', options.schema ?? 'notifications'),
  table: checkedName('history.table', options.history?.table ?? 'history'),
  columns: columnNames('history', historyColumns, options.history?.columns),
})

export type HistoryNames = ReturnType<typeof historyNames>

export type NotificationsNames = ReturnType<typeof notificationsNames>

/** The options, checked as `notifications` takes them: the names, given stores' methods and the senders given. */
export const checkNotificationsOptions = (options: NotificationsOptions) => {
  if (options.ui !== undefined && typeof options.ui !== 'boolean') throw new Error('notifications ui is true or false')
  notificationsNames(options)
  historyNames(options)
  if (options.store !== undefined) checkDeviceStore(options.store)
  if (options.historyStore !== undefined) checkHistoryStore(options.historyStore)
  if (options.senders !== undefined) checkSenders(options.senders)
  return options
}

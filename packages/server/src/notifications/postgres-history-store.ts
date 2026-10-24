import { sql, type RawBuilder } from 'kysely'
import type { Db } from '@protobase/query'
import { isDatabaseError } from '../error-handler'
import { checkedNotification, type StoredNotification } from './history'
import { maxUnreadCount, requiredPage, requiredText, requiredTime, type HistoryStore } from './history-store'
import { historyColumns, historyNames, type HistoryColumn, type NotificationsOptions } from './options'

/**
 * A database error of the history store, holding its SQLSTATE alone: the driver's own carries the failing row in its
 * detail, which must never reach a log.
 */
export class HistoryStoreError extends Error {
  constructor(readonly sqlState: string) {
    super(`The history store's query failed (SQLSTATE ${sqlState})`)
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type HistoryRow = Record<HistoryColumn, unknown>

const entryOf = (row: HistoryRow): StoredNotification => ({
  id: String(row.id),
  userId: String(row.user_id),
  title: row.title as string,
  body: row.body as string | null,
  url: row.url as string | null,
  data: row.data as StoredNotification['data'],
  createdAt: new Date(row.created_at as Date),
  readAt: row.read_at === null ? null : new Date(row.read_at as Date),
})

/** The default history store: the history table `protobase migration` writes, under the names the options give. */
export const postgresHistoryStore = (db: Db, options: NotificationsOptions = {}): HistoryStore => {
  const { schema, table, columns } = historyNames(options)
  const history = sql.id(schema, table)
  const column = (name: HistoryColumn) => sql.id(columns[name])
  // Each column under the name Protobase gives it.
  const selected = sql.join(historyColumns.map((name) => sql`${column(name)} as ${sql.id(name)}`))
  const execute = <R>(query: RawBuilder<R>) =>
    query.execute(db).catch((error: unknown) => {
      if (isDatabaseError(error)) throw new HistoryStoreError(error.code)
      throw error
    })
  const rows = async (query: RawBuilder<HistoryRow>) => (await execute(query)).rows.map(entryOf)
  const unread = (userId: string) => sql`${column('user_id')} = ${userId} and ${column('read_at')} is null`

  return {
    record: async (userId, notification) => {
      requiredText('user id', userId)
      const { title, body, url, data } = checkedNotification(notification)
      const values = { id: crypto.randomUUID(), user_id: userId, title, body, url, data: data === null ? null : JSON.stringify(data), created_at: new Date(), read_at: null }
      const names = sql.join(historyColumns.map(column))
      const given = sql.join(historyColumns.map((name) => (name === 'data' ? sql`${values.data}::jsonb` : sql`${values[name]}`)))
      const [stored] = await rows(sql<HistoryRow>`insert into ${history} (${names}) values (${given}) returning ${selected}`)
      return stored!
    },
    list: async (userId, page) => {
      requiredText('user id', userId)
      const { before, limit } = requiredPage(page)
      // Past an id no Postgres store gave, the position is after none of the user's entries at that time.
      const after = before && uuidPattern.test(before.id) ? sql`and (${column('created_at')}, ${column('id')}) < (${before.createdAt}, ${before.id}::uuid)` : before ? sql`and ${column('created_at')} < ${before.createdAt}` : sql``
      return rows(sql<HistoryRow>`select ${selected} from ${history} where ${column('user_id')} = ${userId} ${after}
        order by ${column('created_at')} desc, ${column('id')} desc limit ${limit}`)
    },
    countUnread: async (userId) => {
      requiredText('user id', userId)
      const result = await execute(sql<{ count: number }>`select count(*)::int as count from (select from ${history} where ${unread(userId)} limit ${maxUnreadCount}) as unread`)
      return result.rows[0]!.count
    },
    markRead: async (userId, id) => {
      requiredText('user id', userId)
      requiredText('id', id)
      if (!uuidPattern.test(id)) return false
      // The first read time stays: an entry read already is found, not changed.
      const result = await execute(sql<{ found: boolean }>`with found as (select ${column('id')} from ${history} where ${column('user_id')} = ${userId} and ${column('id')} = ${id}::uuid),
        marked as (update ${history} set ${column('read_at')} = ${new Date()} where ${column('id')} in (select ${column('id')} from found) and ${column('read_at')} is null)
        select exists (select from found) as found`)
      return result.rows[0]!.found
    },
    markAllRead: async (userId, upTo) => {
      requiredText('user id', userId)
      requiredTime('time', upTo)
      await execute(sql`update ${history} set ${column('read_at')} = ${new Date()} where ${unread(userId)} and ${column('created_at')} <= ${upTo}`)
    },
    removeAllForUser: async (userId) => {
      requiredText('user id', userId)
      await execute(sql`delete from ${history} where ${column('user_id')} = ${userId}`)
    },
  }
}

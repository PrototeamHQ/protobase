import type { Client } from '@protobase/client'
import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { literal, unreadFilter, type UnreadCounts } from './unread'

type Models = Record<string, ResourceModel>

const byGroup = (groups: ReadonlyArray<{ value: unknown; count: number }>) => Object.fromEntries(groups.map(({ value, count }) => [String(value), count]))

/**
 * The unread messages of `me` in the conversations `keys`, read as them in two requests: their read positions, then the
 * messages after each one's own position by someone else, counted per conversation by the database. A conversation
 * never opened counts from its first message. Nothing is counted when the read position resource has no `.author()`.
 */
export const countUnread = async (client: Client, models: Models, page: ConversationPageModel, keys: readonly string[], me: string): Promise<UnreadCounts> => {
  const position = page.readPosition
  const messages = models[page.resource]
  if (!position || !messages || keys.length === 0) return {}
  // Without an author no position is the reader's own, as the conversation page keeps none then
  const author = models[position.resource]?.author
  if (author === undefined) return {}
  const which = keys.map((key) => `${position.field} = ${literal(key)}`).join(' OR ')
  const positions = await client.list(position.resource, { filter: `${author} = ${JSON.stringify(me)} AND (${which})`, pageSize: keys.length, fields: [position.field, position.message] })
  const readTo = new Map(positions.items.map((item) => [String(item[position.field]), Number(item[position.message] ?? 0)]))
  const filter = unreadFilter(page.field, messages.primaryKey[0]!, page.sender, me, keys.map((key) => ({ key, readTo: readTo.get(key) ?? 0 })))
  const counted = byGroup((await client.aggregate(page.resource, { groupBy: page.field, filter, limit: keys.length })).groups)
  return Object.fromEntries(keys.map((key) => [key, counted[key] ?? 0]))
}

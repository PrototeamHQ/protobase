import type { Client } from '@protobase/client'
import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { unreadFilter, type UnreadCounts } from './unread'

type Models = Record<string, ResourceModel>

const byGroup = (groups: ReadonlyArray<{ value: unknown; count: number }>) => Object.fromEntries(groups.map(({ value, count }) => [String(value), count]))

/**
 * The unread messages of `me` in the conversations `keys`, read as them in two requests: their read positions, then the
 * messages after each one's own position by someone else, counted per conversation by the database. A conversation
 * never opened counts from its first message.
 */
export const countUnread = async (client: Client, models: Models, page: ConversationPageModel, keys: readonly string[], me: string): Promise<UnreadCounts> => {
  const position = page.readPosition
  const messages = models[page.resource]
  if (!position || !messages || keys.length === 0) return {}
  const author = models[position.resource]?.author
  const mine = author !== undefined && models[position.resource]!.fields[author]?.filterable ? `${author} = ${JSON.stringify(me)} AND ` : ''
  const which = keys.map((key) => `${position.field} = ${/^-?\d+$/.test(key) ? key : JSON.stringify(key)}`).join(' OR ')
  const positions = await client.list(position.resource, { filter: `${mine}(${which})`, pageSize: keys.length, fields: [position.field, position.message] })
  const readTo = new Map(positions.items.map((item) => [String(item[position.field]), Number(item[position.message] ?? 0)]))
  const filter = unreadFilter(page.field, messages.primaryKey[0]!, page.sender, me, keys.map((key) => ({ key, readTo: readTo.get(key) ?? 0 })))
  const counted = await client.aggregate(page.resource, { groupBy: page.field, filter, limit: keys.length })
  return Object.fromEntries(keys.map((key) => [key, byGroup(counted.groups)[key] ?? 0]))
}

import { threadSort } from '@protobase/layout'
import type { Client } from '@protobase/client'
import { createWhere, printFilter, type ConversationPageModel, type ReadPositionModel } from '@protobase/schema'

const where = createWhere()

/** How many messages a page of the conversation brings: the latest on opening, and each "Load earlier". */
export const conversationPageSize = 50

/** How many records one read of a page of messages' reactions or files brings; a page with more reads on until it has them all. */
export const recordsPageSize = 500

/**
 * The read of a conversation's messages through the list API, with the reader's own access, so a message they may not
 * read never shows: those whose relation holds the record's key, newest first, a page at a time. With threads, only
 * the messages of the conversation itself, not the replies in a thread.
 */
export const messagesRequest = (page: Pick<ConversationPageModel, 'field' | 'time' | 'thread'>, recordKey: string) => ({
  filter: printFilter(page.thread ? where.and(where.eq(page.field, recordKey), where.isNull(page.thread.field)) : where.eq(page.field, recordKey)),
  orderBy: threadSort(page.time),
  pageSize: conversationPageSize,
})

/** The read of the replies in the thread of the message keyed `first`, newest first, a page at a time. */
export const repliesRequest = (page: Pick<ConversationPageModel, 'time'>, thread: NonNullable<ConversationPageModel['thread']>, first: string) => ({
  filter: printFilter(where.eq(thread.field, first)),
  orderBy: threadSort(page.time),
  pageSize: conversationPageSize,
})

/** The records of a resource of the messages' own, such as their reactions or files, by its relation `field` to them. */
type OfMessages = { resource: string; field: string }

/** The filter of the records, such as reactions, of the messages keyed `messages`. */
export const ofMessagesFilter = (of: Pick<OfMessages, 'field'>, messages: readonly string[]) => printFilter(where.in(of.field, [...messages]))

/** Every record, such as a reaction, of the messages keyed `messages`, in one read, or one per `recordsPageSize` of them. */
export const readOfMessages = async (client: Pick<Client, 'list'>, of: OfMessages, messages: readonly string[]) => {
  const filter = ofMessagesFilter(of, messages)
  const rows: Record<string, unknown>[] = []
  let pageToken = ''
  do {
    const page = await client.list(of.resource, { filter, pageSize: recordsPageSize, pageToken })
    rows.push(...page.items)
    pageToken = page.nextPageToken
  } while (pageToken)
  return rows
}

/**
 * The read of the reader's own read position in a record, through the list API: the one whose relation holds the
 * record's key and whose author, `author`, is `me`, even where the resource lets them read other people's.
 */
export const ownPositionFilter = (position: Pick<ReadPositionModel, 'field'>, recordKey: string, author: string, me: string) =>
  printFilter(where.and(where.eq(position.field, recordKey), where.eq(author, me)))

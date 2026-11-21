import { threadSort } from '@protobase/layout'
import { createWhere, printFilter, type ConversationPageModel, type ReadPositionModel } from '@protobase/schema'
import { recordMessagesFilter } from '../conversation/record-filter'

const where = createWhere()

/** How many messages a page of the conversation brings: the latest on opening, and each "Load earlier". */
export const conversationPageSize = 50

/**
 * The read of a conversation's messages through the list API, with the reader's own access, so a message they may not
 * read never shows: those whose relation holds the record's key, newest first, a page at a time.
 */
export const messagesRequest = (page: Pick<ConversationPageModel, 'field' | 'time'>, recordKey: string) => ({
  filter: recordMessagesFilter(page.field, recordKey),
  orderBy: threadSort(page.time),
  pageSize: conversationPageSize,
})

/**
 * The read of the reader's own read position in a record, through the list API: the one whose relation holds the
 * record's key and whose author, `author`, is `me`, even where the resource lets them read other people's.
 */
export const ownPositionFilter = (position: Pick<ReadPositionModel, 'field'>, recordKey: string, author: string, me: string) =>
  printFilter(where.and(where.eq(position.field, recordKey), where.eq(author, me)))

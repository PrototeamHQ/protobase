import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatThread } from '../../chat'
import { useList } from '../../data/use-list'
import { useRecord } from '../../data/use-record'
import { recordKey as keyOf } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import type { PeopleSearch } from '../../mentions'
import { SidePanel } from '../../side-panel'
import { authorOf } from '../conversation/thread-items'
import { MessageComposer } from '../conversation/message-composer'
import { keyValue } from '../create/create-values'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { Quiet } from '../pages/blocks/card-frame'
import { ConversationMessage } from './conversation-message'
import { repliesRequest } from './conversation-reads'
import { conversationRows } from './conversation-rows'
import { useMessageSetup } from './use-message-setup'
import { text } from './messages'

type Props = {
  page: ConversationPageModel & { thread: NonNullable<ConversationPageModel['thread']> }
  /** The record the conversation is of, and its key. */
  owner: ResourceModel
  recordKey: string
  /** The key of the thread's first message. */
  first: string
  me: string | undefined
  searchPeople?: PeopleSearch
  onClose: () => void
}

/**
 * A thread beside its conversation, covering the screen at mobile width: its first message, its replies kept current
 * as the live updates tell of changes, and a box of its own that replies in it. The reader reacts to, edits and deletes
 * its messages as in the conversation. Key it by the first message, so another thread starts afresh.
 */
export const ThreadPanel = ({ page, owner, recordKey, first, me, searchPeople, onClose }: Props) => {
  const { resources, views } = useAdminMeta()
  const model = resources[page.resource]!
  const senders = [page.sender]
  const head = useRecord(page.resource, keyValue(model, first))
  const list = useList(page.resource, { ...repliesRequest(page, page.thread, first), labels: listLabels(resources, views, model, senders) })
  const oldestFirst = withLabels(resources, model, senders, list.items, list.labels).reverse()
  const key = (row: Record<string, unknown>) => String(keyOf(model, row))
  const { setup, reactionsError } = useMessageSetup({ page, me, pages: [[first], ...(list.data?.pages ?? []).map((read) => read.items.map(key))], searchPeople })
  const headRow = head.data?.record
  const error = head.error ?? list.error ?? reactionsError
  const rows = conversationRows(oldestFirst, { key, sender: page.sender, time: page.time })
  const own = rows.findLast((line) => line.kind === 'message' && me !== undefined && line.author.id === me)
  const replies = headRow ? Number(headRow[page.thread.count] ?? 0) : 0
  return (
    <SidePanel
      title={text('thread')}
      onClose={onClose}
      footer={
        <MessageComposer
          resource={page.resource}
          field={page.text}
          values={{ [page.field]: keyValue(owner, recordKey), [page.thread.field]: keyValue(model, first) }}
          placeholder={text('replyPlaceholder')}
          searchPeople={searchPeople}
          mentions={page.mentions}
        />
      }
    >
      {error && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoadThread')} error={error} /></div>}
      {!headRow || list.isLoading ? (
        <div className="flex-1 p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
      ) : (
        <ChatThread length={oldestFirst.length + 1} followKey={own?.key} onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined} loadingEarlier={list.isFetchingNextPage}>
          <ConversationMessage setup={setup} row={headRow} messageKey={first} author={authorOf(headRow[page.sender])} time={typeof headRow[page.time] === 'string' ? (headRow[page.time] as string) : undefined} continued={false} />
          {replies > 0 && <ChatDivider label={text('replies', { count: replies })} />}
          {rows.map((line) =>
            line.kind === 'day' ? (
              <ChatDivider key={line.key} label={line.label} />
            ) : line.kind === 'new' ? null : (
              <ConversationMessage key={line.key} setup={setup} row={line.row} messageKey={line.key} author={line.author} time={line.time} continued={line.continued} />
            ),
          )}
        </ChatThread>
      )}
    </SidePanel>
  )
}

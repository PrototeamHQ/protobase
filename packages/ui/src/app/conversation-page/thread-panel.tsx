import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatThread } from '../../chat'
import { useList } from '../../data/use-list'
import { recordKey as keyOf } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { MentionedText, type PeopleSearch } from '../../mentions'
import { SidePanel } from '../../side-panel'
import { authorOf } from '../conversation/thread-items'
import { MessageComposer } from '../conversation/message-composer'
import { keyValue } from '../create/create-values'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import type { ConversationTyping } from '../../typing/conversation-typing'
import { TypingNames } from '../../typing/typing-names'
import { useTypingBox } from '../../typing/use-typing-box'
import { Quiet } from '../pages/blocks/card-frame'
import { ConversationMessage } from './conversation-message'
import { repliesRequest } from './conversation-reads'
import { conversationRows } from './conversation-rows'
import { useMessageSetup } from './use-message-setup'
import { useOnceReady } from './use-once-ready'
import { useThreadHead } from './use-thread-head'
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
  /** The conversation's typing, which the panel shows and sends for its own thread alone. */
  typing?: ConversationTyping
  onClose: () => void
}

/**
 * A thread beside its conversation, covering the screen at mobile width: its first message, its replies kept current
 * as the live updates tell of changes, and a box of its own that replies in it. The reader reacts to, edits and deletes
 * its messages as in the conversation. A first message of another conversation shows as not found, with no box, so no
 * reply joins a thread of another conversation from here. With `typing`, a line above its box says who else types in
 * the thread. Key it by the first message, so another thread starts afresh.
 */
export const ThreadPanel = ({ page, owner, recordKey, first, me, searchPeople, typing, onClose }: Props) => {
  const { resources, views } = useAdminMeta()
  const model = resources[page.resource]!
  const typed = useTypingBox(typing, keyValue(model, first))
  const senders = [page.sender]
  const head = useThreadHead(page, model, recordKey, first)
  const list = useList(page.resource, { ...repliesRequest(page, page.thread, first), labels: listLabels(resources, views, model, senders) })
  const oldestFirst = withLabels(resources, model, senders, list.items, list.labels).reverse()
  const key = (row: Record<string, unknown>) => String(keyOf(model, row))
  const { setup, reading, reactionsError, attachmentsError } = useMessageSetup({ page, me, pages: [[first], ...(list.data?.pages ?? []).map((read) => read.items.map(key))], searchPeople })
  const headRow = head.row
  // The thread shows once its messages' reactions and files are read and the text's renderer has loaded, so nothing in it moves down as they arrive
  const textLoaded = MentionedText.useLoaded()
  const loaded = useOnceReady(!!headRow && !list.isLoading && !reading && textLoaded)
  const error = head.error ?? list.error ?? reactionsError ?? attachmentsError
  const rows = conversationRows(oldestFirst, { key, sender: page.sender, time: page.time })
  const own = rows.findLast((line) => line.kind === 'message' && me !== undefined && line.author.id === me)
  const replies = headRow ? Number(headRow[page.thread.count] ?? 0) : 0
  return (
    <SidePanel
      title={text('thread')}
      onClose={onClose}
      footer={
        !head.elsewhere && (
          <>
            {typing && <TypingNames users={typing.typers(first)} />}
            <MessageComposer
              resource={page.resource}
              field={page.text}
              values={{ [page.field]: keyValue(owner, recordKey), [page.thread.field]: keyValue(model, first) }}
              placeholder={text('replyPlaceholder')}
              searchPeople={searchPeople}
              mentions={page.mentions}
              attachments={page.attachments}
              onDraft={typed.onText}
              onSent={typed.onSent}
            />
          </>
        )
      }
    >
      {error && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoadThread')} error={error} /></div>}
      {head.elsewhere ? (
        <div className="flex-1 p-4"><Quiet>{text('threadElsewhere')}</Quiet></div>
      ) : !headRow || !loaded ? (
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

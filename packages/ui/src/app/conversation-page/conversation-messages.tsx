import type { AppAddress, ConversationPageModel, ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatThread } from '../../chat'
import { useList } from '../../data/use-list'
import { recordKey as keyOf } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import type { PeopleSearch } from '../../mentions'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { Quiet } from '../pages/blocks/card-frame'
import { retryOf, showsErrorAbove, threadState } from '../conversation/thread-state'
import { ConversationMessage } from './conversation-message'
import { messagesRequest } from './conversation-reads'
import { conversationRows, firstUnreadKey } from './conversation-rows'
import { useMessageSetup } from './use-message-setup'
import { useNewLine } from './use-new-line'
import { text } from './messages'

type Props = {
  page: ConversationPageModel
  model: ResourceModel
  recordKey: string
  me: string | undefined
  /** The reader's read position, as `useReadPosition` gives it. */
  position: { ready: boolean; openedAt: number | undefined; readTo: ((key: number) => void) | undefined }
  /** The address that opens a message's thread, for a conversation with threads. */
  threadTo?: (key: string) => AppAddress
  /** Finds the people `@` lists while editing a message. */
  searchPeople?: PeopleSearch
}

/**
 * The record's messages, the latest page with earlier ones on request, read with the reader's own access and their
 * senders' names in the same read, kept current as the live updates tell of new, changed and deleted ones. They show
 * once the read position is there too, so they open on the "New messages" line, and reading to the end moves it. They
 * scroll in a box of their own, so the box that sends one stays in view. Their reactions are read a page at a time.
 */
export const ConversationMessages = ({ page, model, recordKey, me, position, threadTo, searchPeople }: Props) => {
  const { resources, views } = useAdminMeta()
  const senders = [page.sender]
  const list = useList(model.name, { ...messagesRequest(page, recordKey), labels: listLabels(resources, views, model, senders) })
  const oldestFirst = withLabels(resources, model, senders, list.items, list.labels).reverse()
  const key = (row: Record<string, unknown>) => String(keyOf(model, row))
  const { setup, reactionsError } = useMessageSetup({ page, me, pages: (list.data?.pages ?? []).map((read) => read.items.map(key)), threadTo, searchPeople })
  const state = threadState(list)
  const loaded = state === 'messages' && !list.isLoading && position.ready
  const newLineAbove = useNewLine(loaded && oldestFirst.length > 0 && position.openedAt !== undefined && me !== undefined, () =>
    firstUnreadKey(oldestFirst, { key, sender: page.sender }, position.openedAt!, me!, list.hasNextPage),
  )
  if (state === 'error') return <div className="flex-1 p-4"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>
  // The live region mounts with the messages it opens on, so a screen reader announces only those that arrive later
  if (!loaded) return <div className="flex-1 p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
  const rows = conversationRows(oldestFirst, { key, sender: page.sender, time: page.time }, newLineAbove)
  const newest = oldestFirst.at(-1)
  // The reader's own newest message: when one arrives, the thread goes to the end wherever they were
  const own = rows.findLast((line) => line.kind === 'message' && me !== undefined && line.author.id === me)
  const readTo = position.readTo
  return (
    <>
      {showsErrorAbove(list) && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>}
      {reactionsError !== undefined && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoadReactions')} error={reactionsError} /></div>}
      <ChatThread
        length={oldestFirst.length}
        followKey={own?.key}
        empty={page.empty ?? text('noMessages')}
        onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
        loadingEarlier={list.isFetchingNextPage}
        onReadToEnd={readTo && newest ? () => readTo(Number(key(newest))) : undefined}
      >
        {rows.map((line) =>
          line.kind === 'day' ? (
            <ChatDivider key={line.key} label={line.label} />
          ) : line.kind === 'new' ? (
            <ChatDivider key={line.key} tone="new" />
          ) : (
            <ConversationMessage key={line.key} setup={setup} row={line.row} messageKey={line.key} author={line.author} time={line.time} continued={line.continued} />
          ),
        )}
      </ChatThread>
    </>
  )
}

import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatThread } from '../../chat'
import { useList } from '../../data/use-list'
import { recordKey as keyOf } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { useMembers } from '../../people/use-members'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { Quiet } from '../pages/blocks/card-frame'
import { retryOf, showsErrorAbove, threadState } from '../conversation/thread-state'
import { ConversationMessage } from './conversation-message'
import { messagesRequest } from './conversation-reads'
import { conversationRows, firstUnreadKey, highestKey } from './conversation-rows'
import { useNewLine } from './use-new-line'
import { text } from './messages'

type Props = {
  page: ConversationPageModel
  model: ResourceModel
  recordKey: string
  me: string | undefined
  /** The reader's read position, as `useReadPosition` gives it. */
  position: { ready: boolean; openedAt: number | undefined; readTo: ((key: number) => void) | undefined }
}

/**
 * The record's messages, the latest page with earlier ones on request, read with the reader's own access and their
 * senders' names in the same read, kept current as the live updates tell of new, changed and deleted ones. They show
 * once the read position is there too, so they open on the "New messages" line, and reading to the end moves it. They
 * scroll in a box of their own, so the box that sends one stays in view.
 */
export const ConversationMessages = ({ page, model, recordKey, me, position }: Props) => {
  const { resources, views } = useAdminMeta()
  const { member } = useMembers()
  const senders = [page.sender]
  const list = useList(model.name, { ...messagesRequest(page, recordKey), labels: listLabels(resources, views, model, senders) })
  const oldestFirst = withLabels(resources, model, senders, list.items, list.labels).reverse()
  const key = (row: Record<string, unknown>) => String(keyOf(model, row))
  const state = threadState(list)
  const loaded = state === 'messages' && !list.isLoading && position.ready
  const newLineAbove = useNewLine(loaded && oldestFirst.length > 0 && position.openedAt !== undefined && me !== undefined, () =>
    firstUnreadKey(oldestFirst, { key, sender: page.sender }, position.openedAt!, me!, list.hasNextPage),
  )
  if (state === 'error') return <div className="flex-1 p-4"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>
  // The live region mounts with the messages it opens on, so a screen reader announces only those that arrive later
  if (!loaded) return <div className="flex-1 p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
  const rows = conversationRows(oldestFirst, { key, sender: page.sender, time: page.time }, newLineAbove)
  const readEnd = highestKey(oldestFirst, key)
  // The reader's own newest message: when one arrives, the thread goes to the end wherever they were
  const own = rows.findLast((line) => line.kind === 'message' && me !== undefined && line.author.id === me)
  const readTo = position.readTo
  return (
    <>
      {showsErrorAbove(list) && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>}
      <ChatThread
        length={oldestFirst.length}
        followKey={own?.key}
        empty={page.empty ?? text('noMessages')}
        onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
        loadingEarlier={list.isFetchingNextPage}
        onReadToEnd={readTo && readEnd !== undefined ? () => readTo(readEnd) : undefined}
      >
        {rows.map((line) =>
          line.kind === 'day' ? (
            <ChatDivider key={line.key} label={line.label} />
          ) : line.kind === 'new' ? (
            <ChatDivider key={line.key} tone="new" />
          ) : (
            <ConversationMessage key={line.key} page={page} row={line.row} author={line.author} time={line.time} continued={line.continued} member={member} />
          ),
        )}
      </ChatThread>
    </>
  )
}

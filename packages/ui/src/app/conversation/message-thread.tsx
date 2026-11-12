import { threadSort, type MessageFields } from '@protobase/layout'
import { enumLabel, type ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatMessage, ChatThread } from '../../chat'
import { useOptionalAuth } from '../../auth/auth-provider'
import { useList } from '../../data/use-list'
import { recordKey } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { Markdown } from '../../markdown/markdown'
import { isMarkdown } from '../../markdown/markdown-hint'
import { Quiet } from '../pages/blocks/card-frame'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { threadItems } from './thread-items'
import { retryOf, showsErrorAbove, threadState } from './thread-state'
import { text } from './messages'

export type MessageThreadProps = MessageFields & {
  model: ResourceModel
  /** An AIP-160 filter on the messages, such as the record's key in its relation. */
  filter?: string
  limit?: number
  empty?: string
  /** The other side is writing a reply, so the thread ends in a working indicator. */
  working?: boolean
}

/**
 * The latest `limit` messages of `model` matching `filter`, oldest first, each under its sender's name and time, with
 * earlier ones on request, and its `status` under it in the view's enum labels; a text the message resource's view marks
 * `.markdown()` shows rendered.
 */
export const MessageThread = ({ model, filter, sender, time, text: body, status, limit = 50, empty, working }: MessageThreadProps) => {
  const { resources, views } = useAdminMeta()
  const auth = useOptionalAuth()
  const reader = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const labels = listLabels(resources, views, model, [sender])
  const list = useList(model.name, { filter, orderBy: threadSort(time), pageSize: limit, labels })
  const state = threadState(list)
  if (state === 'error') return <ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} />
  // The live region mounts with the messages it opens on, so a screen reader announces only those that arrive later
  if (state === 'loading') return <div className="p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
  const rows = withLabels(resources, model, [sender], list.items, list.labels)
  const items = threadItems(rows, { key: (row) => String(recordKey(model, row)), sender, time, text: body, status })
  const statusLabels = status === undefined ? undefined : views[model.name]?.fields[status]?.valueLabels
  const markdown = model.fields[body] !== undefined && isMarkdown(model.fields[body], views[model.name]?.fields[body])
  // The reader's own newest message: when one arrives, the thread goes to the end wherever they were
  const own = items.findLast((item) => item.kind === 'message' && item.author.id === reader)
  return (
    <>
      {/* The messages stay, so the reader keeps their place; Try again runs what failed once more */}
      {showsErrorAbove(list) && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>}
      <ChatThread length={rows.length} followKey={own?.key} working={working} empty={empty ?? text('noMessages')} onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined} loadingEarlier={list.isFetchingNextPage}>
        {items.map((item) =>
          item.kind === 'day' ? (
            <ChatDivider key={item.key} label={item.label} />
          ) : (
            <ChatMessage key={item.key} author={item.author} time={item.time} continued={item.continued} footer={item.status !== undefined && enumLabel(item.status, statusLabels)}>
              {/* A message keeps its line breaks; rendered markdown makes its own */}
              {markdown && item.text !== '' ? <Markdown source={item.text} className="whitespace-normal" /> : item.text}
            </ChatMessage>
          ),
        )}
      </ChatThread>
    </>
  )
}

import { threadSort, type MessageFields } from '@protobase/layout'
import type { ResourceModel, ToolCallFields } from '@protobase/schema'
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
import { mergeByTime } from './merge-by-time'
import { MessageStatus } from './message-status'
import { ToolCallItem } from './tool-call-item'
import { messageRows, threadItems } from './thread-items'
import { useToolCalls } from './use-tool-calls'
import { emptyLine, retryOf, showsErrorAbove, threadState } from './thread-state'
import { text } from './messages'

// Each list with earlier items left loads its next page
const loadEarlier = (lists: { hasNextPage: boolean; fetchNextPage: () => unknown }[]) => {
  for (const each of lists) if (each.hasNextPage) void each.fetchNextPage()
}

export type MessageThreadProps = MessageFields & {
  model: ResourceModel
  /** An AIP-160 filter on the messages, such as the record's key in its relation. */
  filter?: string
  limit?: number
  empty?: string
  /** Whether the other side is writing a reply, which the thread's end says; left out, it never says. */
  working?: boolean
  /** The tool calls drawn between the messages in time order: records of `calls.model` matching `calls.filter`, read by `calls.fields`. */
  calls?: { model: ResourceModel; filter?: string; fields: ToolCallFields }
}

/**
 * The latest `limit` messages of `model` matching `filter`, oldest first, each under its sender's name and time, with
 * earlier ones on request, and its `status` under it in the view's enum labels; a text the message resource's view marks
 * `.markdown()` shows rendered. The latest `limit` of its `calls` show between them in time order.
 */
export const MessageThread = ({ model, filter, sender, time, text: body, status, limit = 50, empty, working, calls }: MessageThreadProps) => {
  const { resources, views } = useAdminMeta()
  const auth = useOptionalAuth()
  const reader = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const labels = listLabels(resources, views, model, [sender])
  const list = useList(model.name, { filter, orderBy: threadSort(time), pageSize: limit, labels })
  const callList = useToolCalls(calls, limit)
  const state = threadState(list)
  if (state === 'error') return <ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} />
  // The live region mounts with the messages it opens on, so a screen reader announces only those that arrive later
  if (state === 'loading') return <div className="p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
  const rows = withLabels(resources, model, [sender], list.items, list.labels)
  // A call shows after a message sent at the same time
  const newestFirst = mergeByTime({ items: callList.calls, more: callList.hasNextPage }, { items: messageRows(rows, time), more: list.hasNextPage })
  const items = threadItems(newestFirst, { key: (row) => String(recordKey(model, row)), sender, time, text: body, status })
  const statusHints = status === undefined ? undefined : views[model.name]?.fields[status]
  const markdown = model.fields[body] !== undefined && isMarkdown(model.fields[body], views[model.name]?.fields[body])
  // The reader's own newest message: when one arrives, the thread goes to the end wherever they were
  const own = items.findLast((item) => item.kind === 'message' && item.author.id === reader)
  return (
    <>
      {/* The messages stay, so the reader keeps their place; Try again runs what failed once more */}
      {showsErrorAbove(list) && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoad')} error={list.error} onRetry={retryOf(list)} /></div>}
      {calls && callList.list.error && <div className="shrink-0 p-2"><ErrorBanner title={text('couldNotLoadCalls')} error={callList.list.error} onRetry={retryOf(callList.list)} /></div>}
      <ChatThread
        length={newestFirst.length}
        followKey={own?.key}
        working={working}
        empty={emptyLine(callList.list, { loading: text('loadingMessages'), empty: empty ?? text('noMessages') })}
        onLoadEarlier={list.hasNextPage || callList.hasNextPage ? () => loadEarlier([list, callList.list]) : undefined}
        loadingEarlier={list.isFetchingNextPage || callList.isFetchingNextPage}
      >
        {items.map((item) =>
          item.kind === 'day' ? (
            <ChatDivider key={item.key} label={item.label} />
          ) : item.kind === 'call' ? (
            <ToolCallItem key={item.key} call={item} statusHints={callList.statusHints} />
          ) : (
            <ChatMessage key={item.key} author={item.author} time={item.time} continued={item.continued} footer={item.status !== undefined && <MessageStatus value={item.status} hints={statusHints} />}>
              {/* A message keeps its line breaks; rendered markdown makes its own */}
              {markdown && item.text !== '' ? <Markdown source={item.text} className="whitespace-normal" /> : item.text}
            </ChatMessage>
          ),
        )}
      </ChatThread>
    </>
  )
}

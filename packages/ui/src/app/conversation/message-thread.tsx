import { threadSort, type MessageFields } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
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
import { text } from './messages'

export type MessageThreadProps = MessageFields & {
  model: ResourceModel
  /** An AIP-160 filter on the messages, such as the record's key in its relation. */
  filter?: string
  limit?: number
  empty?: string
}

/**
 * The latest `limit` messages of `model` matching `filter`, oldest first, each under its sender's name and time, with
 * earlier ones on request; a text the message resource's view marks `.markdown()` shows rendered.
 */
export const MessageThread = ({ model, filter, sender, time, text: body, limit = 50, empty }: MessageThreadProps) => {
  const { resources, views } = useAdminMeta()
  const auth = useOptionalAuth()
  const reader = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const labels = listLabels(resources, views, model, [sender])
  const list = useList(model.name, { filter, orderBy: threadSort(time), pageSize: limit, labels })
  if (list.error) return <ErrorBanner title={text('couldNotLoad')} error={list.error} />
  // The live region mounts with the messages it opens on, so a screen reader announces only those that arrive later
  if (list.isLoading) return <div className="p-4"><Quiet>{text('loadingMessages')}</Quiet></div>
  const rows = withLabels(resources, model, [sender], list.items, list.labels)
  const items = threadItems(rows, { key: (row) => String(recordKey(model, row)), sender, time, text: body })
  const markdown = model.fields[body] !== undefined && isMarkdown(model.fields[body], views[model.name]?.fields[body])
  // The reader's own newest message: when one arrives, the thread goes to the end wherever they were
  const own = items.findLast((item) => item.kind === 'message' && item.author.id === reader)
  return (
    <ChatThread length={rows.length} followKey={own?.key} empty={empty ?? text('noMessages')} onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined} loadingEarlier={list.isFetchingNextPage}>
      {items.map((item) =>
        item.kind === 'day' ? (
          <ChatDivider key={item.key} label={item.label} />
        ) : (
          <ChatMessage key={item.key} author={item.author} time={item.time} continued={item.continued}>
            {/* A message keeps its line breaks; rendered markdown makes its own */}
            {markdown && item.text !== '' ? <Markdown source={item.text} className="whitespace-normal" /> : item.text}
          </ChatMessage>
        ),
      )}
    </ChatThread>
  )
}

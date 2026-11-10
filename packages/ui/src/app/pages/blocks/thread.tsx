import { threadSort, type ThreadProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { ChatDivider, ChatMessage, ChatThread } from '../../../chat'
import { useList } from '../../../data/use-list'
import { recordKey } from '../../../live/model-helpers'
import { listLabels, withLabels } from '../../../live/relation-labels'
import { SectionContent } from '../../../record-view/section'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta } from '../../meta-gate'
import { propsOf, type BlockProps } from './block-props'
import { threadItems } from './thread-items'
import { text } from '../messages'

type LoadedProps = ThreadProps & { model: ResourceModel }

const LoadedThread = ({ model, ...props }: LoadedProps) => {
  const { resources, views } = useAdminMeta()
  const { filter, sender, time, text: body, limit = 50, empty } = props
  const labels = listLabels(resources, views, model, [sender])
  const list = useList(model.name, { filter, orderBy: threadSort(time), pageSize: limit, labels })
  if (list.error) return <ErrorBanner title={text('couldNotLoad')} error={list.error} />
  const rows = withLabels(resources, model, [sender], list.items, list.labels)
  const items = threadItems(rows, { key: (row) => String(recordKey(model, row)), sender, time, text: body })
  return (
    <ChatThread length={rows.length} empty={list.isLoading ? undefined : (empty ?? text('noMessages'))} onLoadEarlier={list.hasNextPage ? () => void list.fetchNextPage() : undefined} loadingEarlier={list.isFetchingNextPage}>
      {items.map((item) =>
        item.kind === 'day' ? (
          <ChatDivider key={item.key} label={item.label} />
        ) : (
          <ChatMessage key={item.key} author={item.author} time={item.time} continued={item.continued}>
            {item.text}
          </ChatMessage>
        ),
      )}
    </ChatThread>
  )
}

/**
 * The latest messages of a resource, oldest first, under their sender's name and time, with earlier ones on request.
 * The thread scrolls inside a box of its own, not with the page, so it can open at the newest message and follow the
 * ones that arrive, with what comes after it, such as a composer, in view beneath.
 */
export const ThreadBlock = ({ node, slots }: BlockProps) => {
  const props = propsOf<ThreadProps>(node)
  const { resources } = useAdminMeta()
  const model = resources[props.resource]
  if (!model) return null
  return (
    <section className="flex min-w-0 flex-col" aria-label={props.title}>
      <SectionContent title={props.title} help={props.description} actions={slots.actions}>
        <div className="flex h-[min(36rem,65dvh)] flex-col rounded-lg border border-border bg-background">
          <LoadedThread {...props} model={model} />
        </div>
      </SectionContent>
    </section>
  )
}

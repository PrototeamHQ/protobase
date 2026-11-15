import type { ThreadProps } from '@protobase/layout'
import { SectionContent } from '../../../record-view/section'
import { MessageThread } from '../../conversation/message-thread'
import { ThreadBox } from '../../conversation/thread-box'
import { useAdminMeta } from '../../meta-gate'
import { usePlannedReads } from '../plan-reads'
import { useScopeStack } from '../record-scope'
import { useStackConditions } from '../use-conditions'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

/**
 * The latest messages of a resource, oldest first, under their sender's name and time and over their status, with
 * earlier ones on request, ending in a working indicator while `working` holds for the record around it, with the
 * tool calls of `calls` between them in time order. Inside the records of another block, its latest messages and
 * tool calls come from the page's planned reads.
 */
export const ThreadBlock = ({ node, at, slots, className }: BlockProps) => {
  const { title, description, resource, filter, sender, time, text, status, working, calls, limit, empty } = propsOf<ThreadProps>(node)
  const { resources } = useAdminMeta()
  const [busy] = useStackConditions(working === undefined ? [] : [working], useScopeStack())
  const [messages, plannedCalls] = usePlannedReads([at, at === undefined ? undefined : `${at}#calls`])
  const model = resources[resource]
  if (!model) return null
  const callsModel = calls && resources[calls.resource]
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label={title}>
      <SectionContent title={title} help={description} actions={slots.actions}>
        <ThreadBox>
          <MessageThread model={model} filter={filter} sender={sender} time={time} text={text} status={status} calls={calls && callsModel && { model: callsModel, filter: calls.filter, fields: calls }} limit={limit} empty={empty} working={working === undefined ? undefined : busy === true} {...((messages || plannedCalls) && { planned: { messages, calls: plannedCalls } })} />
        </ThreadBox>
      </SectionContent>
    </section>
  )
}

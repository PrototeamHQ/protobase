import type { ThreadProps } from '@protobase/layout'
import { SectionContent } from '../../../record-view/section'
import { MessageThread } from '../../conversation/message-thread'
import { ThreadBox } from '../../conversation/thread-box'
import { useAdminMeta } from '../../meta-gate'
import { useLayoutRecord } from '../record-scope'
import { useConditions } from '../use-conditions'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

/**
 * The latest messages of a resource, oldest first, under their sender's name and time and over their status, with
 * earlier ones on request, ending in a working indicator while `working` holds for the record around it.
 */
export const ThreadBlock = ({ node, slots, className }: BlockProps) => {
  const { title, description, resource, filter, sender, time, text, status, working, limit, empty } = propsOf<ThreadProps>(node)
  const { resources } = useAdminMeta()
  const [busy] = useConditions(working === undefined ? [] : [working], useLayoutRecord())
  const model = resources[resource]
  if (!model) return null
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label={title}>
      <SectionContent title={title} help={description} actions={slots.actions}>
        <ThreadBox>
          <MessageThread model={model} filter={filter} sender={sender} time={time} text={text} status={status} limit={limit} empty={empty} working={working === undefined ? undefined : busy === true} />
        </ThreadBox>
      </SectionContent>
    </section>
  )
}

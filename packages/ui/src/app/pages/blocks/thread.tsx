import type { ThreadProps } from '@protobase/layout'
import { SectionContent } from '../../../record-view/section'
import { MessageThread } from '../../conversation/message-thread'
import { ThreadBox } from '../../conversation/thread-box'
import { useAdminMeta } from '../../meta-gate'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

/** The latest messages of a resource, oldest first, under their sender's name and time, with earlier ones on request. */
export const ThreadBlock = ({ node, slots, className }: BlockProps) => {
  const { title, description, resource, filter, sender, time, text, limit, empty } = propsOf<ThreadProps>(node)
  const { resources } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  return (
    <section className={cn('flex min-w-0 flex-col', className)} aria-label={title}>
      <SectionContent title={title} help={description} actions={slots.actions}>
        <ThreadBox>
          <MessageThread model={model} filter={filter} sender={sender} time={time} text={text} limit={limit} empty={empty} />
        </ThreadBox>
      </SectionContent>
    </section>
  )
}

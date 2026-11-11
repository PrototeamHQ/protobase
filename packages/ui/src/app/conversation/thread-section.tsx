import type { ThreadSectionModel } from '@protobase/schema'
import { Section } from '../../record-view'
import { useAdminMeta } from '../meta-gate'
import { MessageThread } from './message-thread'
import { recordMessagesFilter } from './record-filter'
import { ThreadBox } from './thread-box'

/** The record's conversation (`l.thread`): the latest messages whose relation `item.field` holds its key. */
export const ThreadSection = ({ item, recordKey }: { item: ThreadSectionModel; recordKey: string }) => {
  const { resources } = useAdminMeta()
  const model = resources[item.resource]
  if (!model) return null
  return (
    <Section title={item.title} help={item.help}>
      <ThreadBox>
        <MessageThread model={model} filter={recordMessagesFilter(item.field, recordKey)} sender={item.sender} time={item.time} text={item.text} limit={item.limit} empty={item.empty} />
      </ThreadBox>
    </Section>
  )
}

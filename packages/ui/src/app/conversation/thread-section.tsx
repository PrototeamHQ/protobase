import type { ThreadSectionModel } from '@protobase/schema'
import { Section } from '../../record-view'
import { useAdminMeta } from '../meta-gate'
import type { LayoutRecord } from '../pages/record-scope'
import { useConditions } from '../pages/use-conditions'
import { MessageThread } from './message-thread'
import { recordMessagesFilter } from './record-filter'
import { ThreadBox } from './thread-box'

/** The record's conversation (`l.thread`): the latest messages whose relation `item.field` holds its key, ending in a working indicator while `item.working` holds for the record, with its `item.calls` between them. */
export const ThreadSection = ({ item, scope }: { item: ThreadSectionModel; scope: LayoutRecord }) => {
  const { resources } = useAdminMeta()
  const [working] = useConditions(item.working === undefined ? [] : [item.working], scope)
  const model = resources[item.resource]
  if (!model) return null
  const callsModel = item.calls && resources[item.calls.resource]
  const calls = item.calls && callsModel && { model: callsModel, filter: recordMessagesFilter(item.calls.field, scope.key), fields: item.calls }
  return (
    <Section title={item.title} help={item.help}>
      <ThreadBox>
        <MessageThread model={model} filter={recordMessagesFilter(item.field, scope.key)} sender={item.sender} time={item.time} text={item.text} status={item.status} calls={calls} limit={item.limit} empty={item.empty} working={item.working === undefined ? undefined : working === true} />
      </ThreadBox>
    </Section>
  )
}

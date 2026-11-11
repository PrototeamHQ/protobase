import type { ComposerSectionModel, ResourceModel } from '@protobase/schema'
import { keyValue } from '../create/create-values'
import { MessageComposer } from './message-composer'

/** A box that sends a message about the record (`l.composer`): each message gets its key in the relation `item.field`. */
export const ComposerSection = ({ item, owner, recordKey }: { item: ComposerSectionModel; owner: ResourceModel; recordKey: string }) => (
  <div className="pb-8">
    <MessageComposer resource={item.resource} field={item.text} values={{ [item.field]: keyValue(owner, recordKey) }} placeholder={item.placeholder} />
  </div>
)

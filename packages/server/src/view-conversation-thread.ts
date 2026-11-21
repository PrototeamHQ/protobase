import type { ConversationThreadModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'
import { readable, typedErrors } from './view-typed-field'

/** What is wrong with a conversation's threads on the messages of `messages`, its full model; empty when nothing is. */
export const threadErrors = (thread: ConversationThreadModel, messages: ResourceModel): string[] => [
  ...matchErrors(messages, thread.field, messages.name).map((error) => `field: ${error}`),
  ...typedErrors(messages, 'count', thread.count, ['integer'], "a thread's number of replies is an integer field"),
  ...typedErrors(messages, 'last', thread.last, ['date', 'timestamp'], "a thread's last reply is a date or timestamp field"),
]

/** Whether a caller whose `messages` model holds only the fields they may read can read the threads' fields. */
export const readsThreads = (thread: ConversationThreadModel, messages: ResourceModel | undefined) => [thread.field, thread.count, thread.last].every((name) => readable(messages, name))

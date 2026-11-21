import { parseCondition } from '@protobase/layout'
import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { readable } from './view-typed-field'

const unlessOf = (option: ConversationPageModel['delete']) => (typeof option === 'object' ? option.unless : undefined)

/**
 * What is wrong with a conversation's delete condition, `unless`: it parses and reads only the message's own fields, as
 * the conversation decides it for each message from the message alone.
 */
export const deleteErrors = (option: ConversationPageModel['delete'], messages: ResourceModel): string[] => {
  const unless = unlessOf(option)
  if (unless === undefined) return []
  const parsed = parseCondition(unless)
  if (!parsed.ok) return [`unless: not a valid condition: ${parsed.message}`]
  return parsed.paths.filter((path) => !Object.hasOwn(messages.fields, path)).map((path) => `unless: names "${path}", but it reads only fields ${messages.name} has`)
}

/** Whether a caller whose `messages` model holds only the fields they may read can tell whether the condition keeps a message. */
export const readsDeleteCondition = (option: ConversationPageModel['delete'], messages: ResourceModel | undefined) => {
  const unless = unlessOf(option)
  if (unless === undefined) return true
  const parsed = parseCondition(unless)
  return parsed.ok && parsed.paths.every((path) => readable(messages, path))
}

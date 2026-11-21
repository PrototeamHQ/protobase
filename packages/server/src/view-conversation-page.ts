import { messageFieldsProblems, messageTextProblems } from '@protobase/layout'
import type { ConversationPageModel, ReadPositionModel, ResourceModel } from '@protobase/schema'
import { keyFieldErrors, ownerErrors, sensitiveErrors, typeErrors } from './view-conversation'
import { matchErrors } from './view-related'

const datedTypes = ['date', 'timestamp']

// A field of `model` the page reads, of one of `types`
const typedErrors = (model: ResourceModel, prop: string, name: string | undefined, types: string[], what: string) => {
  if (name === undefined) return []
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  return types.includes(field.type) ? [] : [`${prop}: "${name}" is ${field.type}; ${what}`]
}

// The reader's own position: a record per reader, by its author, pointing at the record, holding a message's integer key
const readPositionErrors = (position: ReadPositionModel, resource: string, messages: ResourceModel, models: Record<string, ResourceModel>) => {
  const model = models[position.resource]
  if (!model) return [`unknown resource "${position.resource}"`]
  const keyField = messages.primaryKey.length === 1 ? messages.fields[messages.primaryKey[0]!] : undefined
  return [
    ...(model.author === undefined ? [`${position.resource} has no .author(), so it cannot keep each reader's own position`] : []),
    ...matchErrors(model, position.field, resource).map((error) => `field: ${error}`),
    ...typedErrors(model, 'message', position.message, ['integer'], "it holds a message's key, an integer"),
    ...(keyField?.type === 'integer' ? [] : [`${messages.name} needs a key of one integer column, which grows as messages arrive`]),
  ]
}

// The fields every message needs, and whether the page's resource can own them
const coreErrors = (page: ConversationPageModel, resource: string, models: Record<string, ResourceModel>) => {
  const owner = ownerErrors(page, resource, models)
  if (owner.length > 0) return owner
  const target = models[page.resource]!
  const fields = messageFieldsProblems(page, target)
  return [...matchErrors(target, page.field, resource).map((error) => `field: ${error}`), ...fields, ...(fields.length === 0 ? [...typeErrors(page, target), ...sensitiveErrors(page, target)] : [])]
}

/**
 * What is wrong with a record page that is the record's conversation (`.record({ conversation })`) on the view of
 * `resource`, against the full models; empty when it can be shown. The record's own fields are checked by the view.
 */
export const conversationPageErrors = (page: ConversationPageModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const core = coreErrors(page, resource, models)
  if (core.length > 0) return core
  const target = models[page.resource]!
  const record = models[resource]!
  return [
    ...keyFieldErrors(target, page.field, resource).map((error) => `field: ${error}`),
    ...messageTextProblems(page.text, target).map((error) => `text: ${error}`),
    ...typedErrors(target, 'edited', page.edited, datedTypes, 'a message is marked edited by a date or timestamp field'),
    ...typedErrors(target, 'mentions', page.mentions, ['json'], 'mentions are a JSON field of user ids'),
    ...typedErrors(record, 'subtitle', page.subtitle, ['text'], 'a subtitle is a text field'),
    ...typedErrors(record, 'members', page.members, ['json'], 'members are a JSON field of user ids'),
    ...(page.readPosition ? readPositionErrors(page.readPosition, resource, target, models).map((error) => `readPosition: ${error}`) : []),
  ]
}

const readable = (model: ResourceModel | undefined, name: string | undefined) => name !== undefined && model !== undefined && Object.hasOwn(model.fields, name)

/**
 * The conversation page as a caller may see it: gone, so the standard page shows, when they cannot read the messages
 * or a field each one needs; without its edited mark, mentions, subtitle or members when they cannot read those
 * fields, and without its read position when they cannot read that resource, its fields or its author.
 */
export const pruneConversationPage = (page: ConversationPageModel, resource: string, models: Record<string, ResourceModel>): ConversationPageModel | undefined => {
  const { edited, mentions, subtitle, members, readPosition, ...core } = page
  if (coreErrors(page, resource, models).length > 0) return
  const target = models[page.resource]
  const record = models[resource]
  const position = readPosition && models[readPosition.resource]
  const keepsPosition = readPosition !== undefined && position !== undefined && [readPosition.field, readPosition.message, position.author].every((name) => readable(position, name))
  return {
    ...core,
    ...(readable(target, edited) && { edited }),
    ...(readable(target, mentions) && { mentions }),
    ...(readable(record, subtitle) && { subtitle }),
    ...(readable(record, members) && { members }),
    ...(keepsPosition && { readPosition }),
  }
}

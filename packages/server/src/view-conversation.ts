import { conditionProblems, conditionReadable, messageFieldsProblems, messageStatusProblems, messageTextProblems, threadLimitProblems } from '@protobase/layout'
import type { ComposerSectionModel, ResourceModel, ThreadSectionModel } from '@protobase/schema'
import { matchErrors } from './view-related'
import { pruneRecordToolCalls, toolCallsErrors } from './view-tool-calls'

// The conversation hangs off one record by its key, so the record page's resource needs a key of one column
const ownerErrors = (item: { resource: string }, resource: string, models: Record<string, ResourceModel>) => {
  const owner = models[resource]
  if (!owner || !models[item.resource]) return [`unknown resource "${owner ? item.resource : resource}"`]
  return owner.primaryKey.length === 1 ? [] : [`${resource} has a composite key, so its messages cannot point at a record`]
}

// A sensitive value never leaves the server, so a message would show without it
const sensitiveErrors = (item: ThreadSectionModel, model: ResourceModel) =>
  [item.sender, item.time, item.text, ...(item.status === undefined ? [] : [item.status])].flatMap((name) => (model.fields[name]?.sensitive ? [`"${name}" on ${model.name} is sensitive`] : []))

// A message shows its sender's name and its text, so the sender is a relation or a text field and the text a text field
const typeErrors = (item: ThreadSectionModel, model: ResourceModel) => {
  const sender = model.fields[item.sender]!
  const body = model.fields[item.text]!
  return [
    ...(sender.relation || sender.type === 'text' ? [] : [`sender: "${item.sender}" is ${sender.type}; a sender is a relation or a text field`]),
    ...(body.type === 'text' ? [] : [`text: "${item.text}" is ${body.type}; a message is a text field`]),
  ]
}

/**
 * What is wrong with a record's conversation (`l.thread`) on the record page of `resource`, against these models; empty
 * when it can be shown. Against the full models it checks the config; against a caller's models, whether that caller can use it.
 */
export const threadSectionErrors = (item: ThreadSectionModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = ownerErrors(item, resource, models)
  if (owner.length > 0) return owner
  const target = models[item.resource]!
  const fields = [...messageFieldsProblems(item, target), ...messageStatusProblems(item.status, target)]
  return [
    ...matchErrors(target, item.field, resource).map((error) => `field: ${error}`),
    ...fields,
    ...(fields.length === 0 ? [...typeErrors(item, target), ...sensitiveErrors(item, target)] : []),
    ...threadLimitProblems(item.limit),
    ...(item.working === undefined ? [] : conditionProblems(item.working, resource, models).map((error) => `working: ${error}`)),
    ...(item.calls === undefined ? [] : toolCallsErrors(item.calls, resource, models).map((error) => `calls: ${error}`)),
  ]
}

/**
 * A record's conversation as a caller may see it: gone when they cannot read the messages or a field each one needs,
 * without its status line, working indicator or tool calls when they cannot read what those name.
 */
export const pruneThreadSection = (item: ThreadSectionModel, resource: string, models: Record<string, ResourceModel>): ThreadSectionModel | undefined => {
  const { status, working, calls, ...core } = item
  if (threadSectionErrors(core, resource, models).length > 0) return
  const keepsStatus = status !== undefined && messageStatusProblems(status, models[item.resource]!).length === 0
  const keepsWorking = working !== undefined && conditionReadable(working, resource, models)
  const keptCalls = calls === undefined ? undefined : pruneRecordToolCalls(calls, resource, models)
  return { ...core, ...(keepsStatus && { status }), ...(keepsWorking && { working }), ...(keptCalls && { calls: keptCalls }) }
}

// Each message gets the record's key in a relation to it the sender may set
const keyFieldErrors = (model: ResourceModel, name: string, resource: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`unknown field "${name}" on ${model.name}`]
  if (field.relation?.resource !== resource) return [`"${name}" on ${model.name} is not a relation to ${resource}`]
  return field.readOnly || name === model.tenant || name === model.author ? [`"${name}" is read-only on ${model.name}`] : []
}

/** What is wrong with a box that sends a message about the record (`l.composer`) on the record page of `resource`; empty when it can be shown. */
export const composerSectionErrors = (item: ComposerSectionModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = ownerErrors(item, resource, models)
  if (owner.length > 0) return owner
  const target = models[item.resource]!
  return [...keyFieldErrors(target, item.field, resource).map((error) => `field: ${error}`), ...messageTextProblems(item.text, target).map((error) => `text: ${error}`)]
}

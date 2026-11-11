import { checkOrderBy, parseOrderBy, type ResourceModel } from '@protobase/schema'
import type { LayoutNode } from './node'

const datedTypes = ['date', 'timestamp']

const fieldOf = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)

/** The fields a thread reads of each message: who wrote it, when, and the message itself. */
export type MessageFields = { sender: string; time: string; text: string }

/** The fields a thread reads of each message: its sender, its time and its text. */
export const threadFields = (node: LayoutNode) => [String(node.props.sender), String(node.props.time), String(node.props.text)]

/** The order a thread reads its messages in, by its `time` field: the newest first, which it shows oldest first. */
export const threadSort = (time: string) => `${time} desc`

/** What a thread's message fields name that the message resource does not have, or cannot order the messages by. */
export const messageFieldsProblems = (fields: MessageFields, model: ResourceModel): string[] => {
  const unknown = (['sender', 'time', 'text'] as const).flatMap((prop) => (fieldOf(model, fields[prop]) ? [] : [`${prop}: unknown field "${fields[prop]}" on ${model.name}`]))
  if (unknown.length > 0) return unknown
  const time = fieldOf(model, fields.time)!
  if (!datedTypes.includes(time.type)) return [`time: "${time.name}" is ${time.type}; a thread orders its messages by a date or timestamp field`]
  const parsed = parseOrderBy(threadSort(time.name))
  const sorted = parsed.ok ? checkOrderBy(model, parsed.items) : parsed
  return sorted.ok ? [] : [`time: ${sorted.errors.map((error) => error.message).join('; ')}`]
}

/** The most messages a thread reads at once: each load is one page of the API, whose largest page is 500 records. */
export const maxThreadLimit = 500

/** Why a thread cannot read `limit` messages at once. */
export const threadLimitProblems = (limit: unknown): string[] =>
  limit === undefined || (Number.isInteger(limit) && (limit as number) > 0 && (limit as number) <= maxThreadLimit) ? [] : [`limit must be a whole number from 1 to ${maxThreadLimit}`]

/** What a thread names that its message resource does not have, or cannot order the messages by, and a limit it cannot read. */
export const threadProblems = (node: LayoutNode, model: ResourceModel): string[] => [
  ...messageFieldsProblems({ sender: String(node.props.sender), time: String(node.props.time), text: String(node.props.text) }, model),
  ...threadLimitProblems(node.props.limit),
]

/** Whether a message may set the field `name`: not one the server sets, such as its tenant or author. */
const sendable = (name: string, model: ResourceModel) => !fieldOf(model, name)!.readOnly && name !== model.tenant && name !== model.author

/** Why a message cannot be written into the field `name`: it is no text field the sender may set. */
export const messageTextProblems = (name: string, model: ResourceModel): string[] => {
  const field = fieldOf(model, name)
  if (!field) return [`unknown field "${name}" on ${model.name}`]
  if (field.type !== 'text') return [`"${name}" is ${field.type}; a message is written into a text field`]
  if (!sendable(name, model)) return [`"${name}" is read-only on ${model.name}, so a message cannot be written into it`]
  return []
}

/** Why a composer cannot send the value of the field `name` with each message: it is unknown, or a field the sender may not set. */
const valueProblems = (name: string, model: ResourceModel): string[] => {
  if (!fieldOf(model, name)) return [`values: unknown field "${name}" on ${model.name}`]
  if (!sendable(name, model)) return [`values: "${name}" is read-only on ${model.name}, so a message cannot set it`]
  return []
}

/** What a composer names that its resource does not let a message write: the text field and the values sent with it. */
export const composerProblems = (node: LayoutNode, model: ResourceModel): string[] => {
  const fieldProblems = messageTextProblems(String(node.props.field), model).map((problem) => `field: ${problem}`)
  const values = Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {})
  return [...fieldProblems, ...values.flatMap((value) => valueProblems(value, model))]
}

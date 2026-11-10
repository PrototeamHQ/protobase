import { checkOrderBy, parseOrderBy, type ResourceModel } from '@protobase/schema'
import type { LayoutNode } from './node'

const datedTypes = ['date', 'timestamp']

const fieldOf = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)

/** The fields a thread reads of each message: its sender, its time and its text. */
export const threadFields = (node: LayoutNode) => [String(node.props.sender), String(node.props.time), String(node.props.text)]

/** The order a thread reads its messages in, by its `time` field: the newest first, which it shows oldest first. */
export const threadSort = (time: string) => `${time} desc`

/** What a thread names that its message resource does not have, or cannot order the messages by. */
export const threadProblems = (node: LayoutNode, model: ResourceModel): string[] => {
  const unknown = (['sender', 'time', 'text'] as const).flatMap((prop) => {
    const name = String(node.props[prop])
    return fieldOf(model, name) ? [] : [`${prop}: unknown field "${name}" on ${model.name}`]
  })
  if (unknown.length > 0) return unknown
  const time = fieldOf(model, String(node.props.time))!
  if (!datedTypes.includes(time.type)) return [`time: "${time.name}" is ${time.type}; a thread orders its messages by a date or timestamp field`]
  const parsed = parseOrderBy(threadSort(time.name))
  const sorted = parsed.ok ? checkOrderBy(model, parsed.items) : parsed
  return sorted.ok ? [] : [`time: ${sorted.errors.map((error) => error.message).join('; ')}`]
}

/** What a composer names that its resource does not let a message write: the text field and the values sent with it. */
export const composerProblems = (node: LayoutNode, model: ResourceModel): string[] => {
  const name = String(node.props.field)
  const field = fieldOf(model, name)
  const fieldProblems = !field
    ? [`field: unknown field "${name}" on ${model.name}`]
    : field.type !== 'text'
      ? [`field: "${name}" is ${field.type}; a message is written into a text field`]
      : field.readOnly || name === model.tenant || name === model.author
        ? [`field: "${name}" is read-only on ${model.name}, so a message cannot be written into it`]
        : []
  const values = Object.keys((node.props.values as Record<string, unknown> | undefined) ?? {})
  const valueProblems = values.flatMap((value) => (fieldOf(model, value) ? [] : [`values: unknown field "${value}" on ${model.name}`]))
  return [...fieldProblems, ...valueProblems]
}

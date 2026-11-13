import { checkOrderBy, parseOrderBy, type ResourceModel } from '@protobase/schema'

const datedTypes = ['date', 'timestamp']

/** The order a thread reads its messages and tool calls in, by their `time` field: the newest first, which it shows oldest first. */
export const threadSort = (time: string) => `${time} desc`

/** Why a thread cannot order its items by the known field `time` of `model`: it is no date or timestamp, or not sortable. */
export const timeProblems = (time: string, model: ResourceModel, items = 'messages'): string[] => {
  const field = model.fields[time]!
  if (!datedTypes.includes(field.type)) return [`time: "${field.name}" is ${field.type}; a thread orders its ${items} by a date or timestamp field`]
  const parsed = parseOrderBy(threadSort(field.name))
  const sorted = parsed.ok ? checkOrderBy(model, parsed.items) : parsed
  return sorted.ok ? [] : [`time: ${sorted.errors.map((error) => error.message).join('; ')}`]
}

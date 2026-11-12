import type { ActionInputModel } from '@protobase/schema'

type Fields = Record<string, unknown>

// The texts a record holds in a checklist's `from` field; anything but a list of texts holds none.
const ownBoxes = (input: ActionInputModel, record: Fields | undefined) => {
  const held = input.from === undefined ? undefined : record?.[input.from]
  return Array.isArray(held) ? held.filter((box): box is string => typeof box === 'string') : []
}

/** The boxes a checklist shows for the records an action runs on: its `items`, or each box their `from` field holds, once, in order. */
export const checklistBoxes = (input: ActionInputModel, records: Fields[]) => {
  if (input.items) return input.items
  return [...new Set(records.flatMap((record) => ownBoxes(input, record)))]
}

/**
 * The answers as `record` gets them: each checklist that shows answers the boxes this record holds, its `items` or its
 * own `from` boxes, every one ticked before the action runs.
 */
export const answersFor = (inputs: ActionInputModel[], values: Record<string, unknown>, record: Fields | undefined) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      const input = inputs.find((entry) => entry.name === name)
      if (input?.kind !== 'checklist') return [name, value]
      return [name, input.items ?? ownBoxes(input, record)]
    }),
  )

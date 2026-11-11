import type { FieldType, RelatedModel, ResourceModel } from '@protobase/schema'

const isCards = (item: RelatedModel) => item.presentation === 'cards' || item.presentation === 'compact'

// A field of the listed resource itself, of one of `types`, which `kind` names, that the caller may read
const fieldErrors = (option: 'time' | 'tone', name: string, target: ResourceModel, types: FieldType[], kind: string) => {
  const field = Object.hasOwn(target.fields, name) ? target.fields[name]! : undefined
  if (!field) return [`${option}: unknown field "${name}" on ${target.name}`]
  if (field.sensitive) return [`${option}: "${name}" on ${target.name} is sensitive`]
  return types.includes(field.type) ? [] : [`${option}: "${name}" on ${target.name} is not ${kind}`]
}

/** What is wrong with the `time` beside a compact card's title and the `tone` field that colours a card's edge. */
export const relatedCardErrors = (item: RelatedModel, target: ResourceModel) => [
  ...(item.time === undefined ? [] : item.presentation === 'compact' ? fieldErrors('time', item.time, target, ['date', 'timestamp'], 'a date or timestamp') : ['time needs presentation "compact"']),
  ...(item.tone === undefined ? [] : isCards(item) ? fieldErrors('tone', item.tone, target, ['enum'], 'an enum') : ['tone needs presentation "cards" or "compact"']),
]

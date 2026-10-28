import type { OrganizationPerson } from '@protobase/client'
import { titleMatches } from '../../relation-options'
import type { PickerOption } from '../../picker/picker-combobox'

/** The user ids a `members` field holds: the strings of its array, nothing for a value that is none. */
export const memberIdsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])

/** The ids with `id` added, or taken off when they hold it already. */
export const toggledId = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((held) => held !== id) : [...ids, id])

/** The members whose name holds every word of `search`, as the picker's options keyed by user id. */
export const memberOptions = (people: OrganizationPerson[], search: string): PickerOption[] =>
  people.filter((person) => titleMatches(person.name, search)).map((person) => ({ key: person.id, label: person.name }))

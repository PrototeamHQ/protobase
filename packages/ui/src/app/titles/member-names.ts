import type { TitleReader, TitleRule } from './title-rule'

/** The user ids in a members field other than `me`, in the order they were added; none when it holds no list. */
export const otherMembers = (value: unknown, me: string | undefined) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== me) : [])

/**
 * The names of the people in a members field other than the reader, joined by commas: the built-in `members` title
 * rule. Nothing while a name is not known yet, so the record shows its key until the members load.
 */
export const memberNames =
  (field: string): TitleRule =>
  (record, { user, member }: TitleReader) => {
    const names = otherMembers(record[field], user?.id).map((id) => member(id)?.name)
    if (names.length === 0 || !names.every(Boolean)) return
    return names.join(', ')
  }

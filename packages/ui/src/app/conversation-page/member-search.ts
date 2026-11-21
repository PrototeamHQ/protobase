import type { PickedUser } from '../../mentions'

/** The most people `@` lists at once; typing more of a name narrows them. */
export const mentionListSize = 8

/**
 * The organization's members whose name holds `query`, ignoring case, other than `me`, in the members' order, at most
 * `mentionListSize`: the people the composer's `@` lists.
 */
export const matchingMembers = (members: readonly PickedUser[], query: string, me: string | undefined): PickedUser[] => {
  const wanted = query.toLocaleLowerCase()
  return members
    .filter((person) => person.id !== me && person.name.toLocaleLowerCase().includes(wanted))
    .slice(0, mentionListSize)
    .map(({ id, name }) => ({ id, name }))
}

import type { AuthUser, OrganizationPerson } from '@protobase/client'

/** Who reads a record whose title is derived: the signed-in user, if any, and the organization's members by user id. */
export type TitleReader = {
  user: AuthUser | undefined
  /** The member with this user id, as `useMembers()` gives them; undefined while the members load or without organizations. */
  member: (id: string) => OrganizationPerson | undefined
}

/**
 * A rule a view's `.titleFrom(name, ...)` names: the record's title for this reader, from the fields the view picked.
 * Returning undefined or an empty string titles the record by its key, as while the members load.
 */
export type TitleRule = (record: Record<string, unknown>, reader: TitleReader) => string | undefined

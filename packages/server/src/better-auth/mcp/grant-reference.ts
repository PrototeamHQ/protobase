/** The access a client is allowed with: the role, and with organizations the organization, of the moment it was allowed. */
export type Grant = { role?: string; organization?: string }

/**
 * The grant written as a consent's `referenceId`: the same text for the same grant, so a consent made with one role
 * is not found for another, and the person is asked again.
 */
export const grantReference = ({ role, organization }: Grant) => {
  const entries = Object.entries({ organization, role }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
  return new URLSearchParams(entries.sort(([a], [b]) => a.localeCompare(b))).toString()
}

/** The grant a `referenceId` holds; none for a missing or empty one. */
export const readGrantReference = (reference: string | null | undefined): Grant => {
  if (!reference) return {}
  const params = new URLSearchParams(reference)
  const role = params.get('role')
  const organization = params.get('organization')
  return { ...(role && { role }), ...(organization && { organization }) }
}

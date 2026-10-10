export type MembershipSummary = { organizationId: string; createdAt: Date | string }

/**
 * The organization a new session starts in: the last one the person worked in while they may still enter it (a member
 * there, or holding a global role, which enters any that still exists), else their oldest membership, else none.
 */
export const initialOrganization = (input: { memberships: readonly MembershipSummary[]; last?: string | null; entersAny: boolean; lastExists: boolean }) => {
  const { memberships, last } = input
  if (last && (memberships.some((membership) => membership.organizationId === last) || (input.entersAny && input.lastExists))) return last
  const oldest = [...memberships].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
  return oldest?.organizationId
}

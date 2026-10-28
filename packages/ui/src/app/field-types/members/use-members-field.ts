import { useOptionalAuth } from '../../../auth/auth-provider'
import { useMembers } from '../../../people/use-members'

/**
 * The organization's members for a `members` field, and what keeps it from showing them: `needsOrganizations` in an
 * app without them, where `useMembers` would fail, and `failed` when they could not be read.
 */
export const useMembersField = () => {
  const auth = useOptionalAuth()
  const members = useMembers()
  return { ...members, needsOrganizations: !auth?.organizations, failed: members.isError }
}

import { useOptionalAuth } from '../../../auth/auth-provider'
import { formatDateTime } from '../../../format/date'
import { useMembers } from '../../../people/use-members'
import { text } from './messages'

// An organization's member by name, read with the members list.
const MemberName = ({ id }: { id: string }) => <>{useMembers().member(id)?.name ?? id}</>

/** Who last marked the workflow resolved and when: you, a member of the organization by name, or else their user id. */
export const ResolvedBy = ({ by, at }: { by: string | null; at: string }) => {
  const auth = useOptionalAuth()
  const self = auth?.state.kind === 'signed-in' && by !== null && String(auth.state.user.id) === by
  const who = self ? text('you') : by === null ? '?' : auth?.organizations ? <MemberName id={by} /> : by
  return <p className="text-body text-muted-foreground">{text.rich('resolvedBy', { who, when: formatDateTime(Date.parse(at)) })}</p>
}

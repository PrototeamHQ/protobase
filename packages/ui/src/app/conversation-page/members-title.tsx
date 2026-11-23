import { useOptionalAuth } from '../../auth/auth-provider'
import { useMembers } from '../../people/use-members'
import { presenceOf, usePresence, useShownPeople } from '../../presence/presence'
import { StatusMark } from '../../status/status-mark'
import { otherMembers } from '../titles/member-names'

/**
 * The people of a members field other than the reader, by name, each with their presence and status as `StatusMark`
 * draws it: its text in full beside one person, on hover beside several. `fallback`, the record's title, shows until
 * every name is known.
 */
export const MembersTitle = ({ value, fallback }: { value: unknown; fallback: string }) => {
  const auth = useOptionalAuth()
  const me = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const { member } = useMembers()
  const presence = usePresence()
  const others = otherMembers(value, me)
  useShownPeople(others)
  if (others.length === 0 || !others.every((id) => member(id))) return fallback
  return others.map((id, index) => (
    <span key={id} className="inline-flex min-w-0 items-center gap-1.5">
      {member(id)!.name}
      <StatusMark status={member(id)!.status} presence={presenceOf(presence, id)} textShown={others.length === 1 ? 'full' : 'hover'} />
      {index < others.length - 1 && ','}
    </span>
  ))
}

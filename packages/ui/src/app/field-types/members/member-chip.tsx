import { hueOf, initialsOf } from '../../../auth/user-to-shell'
import { Avatar } from '../../../primitives/avatar'
import { text } from './messages'

/** A member by avatar and name, as chat messages and comments draw their authors; a name of `undefined` is someone unknown. */
export const MemberChip = ({ id, name }: { id: string; name: string | undefined }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <Avatar initials={(name && initialsOf(name)) || '?'} hue={hueOf(id)} size="xs" className="ring-0" />
    <span className={name === undefined ? 'truncate text-muted-foreground' : 'truncate'}>{name ?? text('unknownMember')}</span>
  </span>
)

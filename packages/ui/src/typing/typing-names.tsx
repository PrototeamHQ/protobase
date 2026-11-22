import { useMembers } from '../people/use-members'
import { text } from '../app/conversation-page/messages'

/** The line for the names of those typing: one, two, or several; nothing for nobody. */
export const typingText = (names: readonly string[]) => {
  if (names.length === 0) return ''
  if (names.length === 1) return text('typingOne', { name: names[0]! })
  if (names.length === 2) return text('typingTwo', { first: names[0]!, second: names[1]! })
  return text('typingMany')
}

/**
 * The line above a box saying who else types, by the user ids given, named as the organization's members the page
 * already has; it keeps its height while nobody does, so the box does not move.
 */
export const TypingNames = ({ users }: { users: readonly string[] }) => {
  const { member } = useMembers()
  const names = users.map((id) => member(id)?.name ?? text('someone'))
  return (
    <p className="h-5 shrink-0 truncate px-4 text-xs text-muted-foreground" aria-live="polite">
      {typingText(names)}
    </p>
  )
}

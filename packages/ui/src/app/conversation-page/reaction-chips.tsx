import { Button } from '../../primitives/button'
import type { ReactionGroup } from './reactions'
import { text } from './messages'

type Props = {
  groups: readonly ReactionGroup[]
  member: (id: string) => { name: string } | undefined
  /** Given when the reader may react. */
  onReact?: (emoji: string) => void
  /** Given when the reader may take back their own reaction. */
  onUnreact?: (reaction: Record<string, unknown>) => void
}

/**
 * A message's reactions, one button per emoji with its count, naming who reacted on hover: the reader's own filled,
 * taking it back when pressed, and another's adding the reader's with the same emoji.
 */
export const ReactionChips = ({ groups, member, onReact, onUnreact }: Props) =>
  groups.map(({ emoji, symbol, name, count, userIds, mine }) => {
    const people = userIds.map((id) => member(id)?.name ?? text('someone')).join(', ')
    const press = mine ? onUnreact && (() => onUnreact(mine)) : onReact && (() => onReact(emoji))
    return (
      <Button key={emoji} size="sm" variant={mine ? 'primary' : 'secondary'} aria-pressed={mine !== undefined} aria-label={text('reactedBy', { name, people })} title={people} disabled={!press} onClick={press}>
        <span aria-hidden>{symbol}</span>
        <span>{count}</span>
      </Button>
    )
  })

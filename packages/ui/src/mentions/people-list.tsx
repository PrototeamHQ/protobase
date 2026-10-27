import { cn } from '../lib/cn'
import type { PickedUser } from './mention-text'
import { text } from './messages'

export type PeopleListProps = {
  id: string
  /** The id of the option at `index`, which the box names as its active descendant. */
  optionId: (index: number) => string
  people: readonly PickedUser[]
  active: number
  onActive: (index: number) => void
  onPick: (user: PickedUser) => void
  /** The search failed, which the list says instead of finding no one. */
  failed: boolean
  at: 'below' | 'above'
}

/** The people a mention box offers for the `@` being typed; a press keeps the focus in the box. */
export const PeopleList = ({ id, optionId, people, active, onActive, onPick, failed, at }: PeopleListProps) => (
  <ul
    id={id}
    role="listbox"
    aria-label={text('peopleToMention')}
    className={cn('absolute z-30 w-full max-w-sm rounded-md border bg-background py-1 shadow-pop', at === 'above' ? 'bottom-full mb-1' : 'mt-1')}
    onMouseDown={(event) => event.preventDefault()}
  >
    {people.map((user, index) => (
      <li
        key={user.id}
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        className={cn('cursor-pointer truncate px-3 py-1.5', index === active && 'bg-muted')}
        onMouseMove={() => index !== active && onActive(index)}
        onClick={() => onPick(user)}
      >
        {user.name}
      </li>
    ))}
    {people.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{failed ? text('couldNotSearch') : text('noOneFound')}</li>}
  </ul>
)

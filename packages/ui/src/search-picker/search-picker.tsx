import { Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { Input } from '../primitives/input'
import { matchingGroups, type PickerGroup, type PickerItem } from './match'
import { text } from './messages'

export type SearchPickerProps = {
  groups: readonly PickerGroup[]
  /** The search box's accessible name; "Search" by default. */
  label?: string
  /** Takes the keyboard as it shows. */
  autoFocus?: boolean
  onPick: (item: PickerItem) => void
}

/**
 * A searchable list to pick one thing from, richer than a select: each item a title with an icon and a line that says
 * what it is, in named groups. The arrow keys move through what the search finds and Enter picks. For a side panel, a
 * dialog or a page of its own; it knows nothing of what is picked.
 */
export const SearchPicker = ({ groups, label = text('search'), autoFocus = false, onPick }: SearchPickerProps) => {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const list = useId()
  const shown = useMemo(() => matchingGroups(groups, query), [groups, query])
  const items = shown.flatMap((group) => group.items)
  const current = items[Math.min(active, items.length - 1)]
  // By where it stands, so two groups may hold the same item
  const optionId = (item: PickerItem) => `${list}-${items.indexOf(item)}`
  useEffect(() => {
    if (autoFocus) search.current?.focus()
  }, [autoFocus])
  const currentId = current && optionId(current)
  useEffect(() => {
    if (currentId) document.getElementById(currentId)?.scrollIntoView({ block: 'nearest' })
  }, [currentId])
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length === 0) return
      const at = Math.min(active, items.length - 1)
      setActive((at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    }
    if (event.key === 'Enter' && current && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onPick(current)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Input
        ref={search}
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded
        aria-controls={list}
        aria-activedescendant={current && optionId(current)}
        placeholder={label}
        leading={<Search className="size-4" aria-hidden />}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <div id={list} role="listbox" aria-label={label} className="flex flex-col gap-3">
        {shown.map((group) => (
          <div key={group.title} role="group" aria-label={group.title}>
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  id={optionId(item)}
                  role="option"
                  aria-selected={item === current}
                  className={cn('flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 max-md:min-h-11', item === current ? 'bg-muted' : 'hover:bg-muted')}
                  onMouseEnter={() => setActive(items.indexOf(item))}
                  onClick={() => onPick(item)}
                >
                  {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block font-medium">{item.title}</span>
                    {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {items.length === 0 && <p className="px-2 text-body text-muted-foreground">{text('nothing', { query: query.trim() })}</p>}
    </div>
  )
}

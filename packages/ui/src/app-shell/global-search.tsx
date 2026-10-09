import { Search, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type Ref } from 'react'
import { cn } from '../lib/cn'
import { Input } from '../primitives/input'
import { Kbd } from '../primitives/kbd'
import { Spinner } from '../primitives/spinner'

export type SearchResultGroup = {
  id: string
  label: string
  /** `href` is a real link: a plain click calls `onSelect`, a modified or middle click opens it in a new tab. */
  hits: Array<{ id: string; title: string; subtitle?: string; href: string }>
  /** The search in this group failed; it says so instead of listing nothing. */
  failed?: boolean
}

/** What the top bar's search shows and does; the app fills it from its resources. */
export type GlobalSearchModel = {
  placeholder: string
  text: string
  onTextChange: (text: string) => void
  /** The text the groups belong to; empty while the text is too short to search. */
  query: string
  loading: boolean
  groups: SearchResultGroup[]
  onSelect: (href: string) => void
}

/** Moves the highlighted result by `delta`, wrapping around; from nothing (`-1`) it goes to the first or the last. */
export const moveActive = (active: number, count: number, delta: 1 | -1) => {
  if (count === 0) return -1
  if (active < 0) return delta === 1 ? 0 : count - 1
  return (active + delta + count) % count
}

/** A click the browser should handle itself: a new tab or window, or a download. */
const opensElsewhere = (event: MouseEvent) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0

type GlobalSearchProps = { search: GlobalSearchModel; className?: string; autoFocus?: boolean; showShortcut?: boolean; ref?: Ref<HTMLInputElement> }

/**
 * A search box with grouped results under it, each a link: arrows move through them, Enter or a click opens one and
 * closes the list, keeping the text, so focusing the box again shows the same results. Escape clears, then leaves.
 */
export const GlobalSearch = ({ search, className = 'w-96', autoFocus, showShortcut = true, ref }: GlobalSearchProps) => {
  const listId = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const hits = search.groups.flatMap((group) => group.hits)
  const open = focused && (search.query !== '' || search.loading)
  const optionId = (index: number) => `${listId}-${index}`

  const setInput = (node: HTMLInputElement | null) => {
    input.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  const choose = (href: string) => {
    search.onSelect(href)
    setActive(-1)
    input.current?.blur()
  }

  const clear = () => {
    search.onTextChange('')
    setActive(-1)
    input.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => moveActive(current, hits.length, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      const hit = hits[active] ?? hits[0]
      if (!hit) return
      event.preventDefault()
      choose(hit.href)
    } else if (event.key === 'Escape') {
      if (search.text) search.onTextChange('')
      else event.currentTarget.blur()
      setActive(-1)
    }
  }

  let position = -1
  return (
    <div className={cn('relative', className)}>
      <Input
        ref={setInput}
        wrapperClassName="w-full bg-surface shadow-none"
        leading={search.loading ? <Spinner className="size-4" /> : <Search className="size-4" />}
        trailing={
          search.text ? (
            <button type="button" aria-label="Clear search" className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={clear}>
              <X className="size-3.5" />
            </button>
          ) : showShortcut ? (
            <span className="hidden md:inline-flex">
              <Kbd>⌘K</Kbd>
            </span>
          ) : undefined
        }
        placeholder={search.placeholder}
        aria-label="Global search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && hits[active] ? optionId(active) : undefined}
        autoFocus={autoFocus}
        value={search.text}
        onChange={(event) => {
          search.onTextChange(event.target.value)
          setActive(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div id={listId} role="listbox" aria-label="Search results" className="absolute right-0 top-full z-40 mt-1 max-h-96 w-full min-w-72 overflow-y-auto rounded-lg border bg-background py-1 text-[13px] shadow-pop">
          {search.groups.length === 0 && <p className="px-3 py-2 text-muted-foreground">{search.loading ? 'Searching' : `No matches for “${search.query}”`}</p>}
          {search.groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label}>
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint-foreground">{group.label}</div>
              {group.failed && <p className="px-3 py-1.5 text-danger-text">Could not search {group.label.toLowerCase()}</p>}
              {group.hits.map((hit) => {
                position += 1
                const index = position
                return (
                  <a
                    key={hit.id}
                    id={optionId(index)}
                    href={hit.href}
                    tabIndex={-1}
                    role="option"
                    aria-selected={index === active}
                    className={cn('block px-3 py-1.5', index === active ? 'bg-primary-soft text-primary-text' : 'hover:bg-muted')}
                    // Keeps the focus in the box, so the list stays open until the click lands
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (opensElsewhere(event)) return
                      event.preventDefault()
                      choose(hit.href)
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="block truncate font-semibold">{hit.title}</span>
                    {hit.subtitle && <span className={cn('block truncate text-xs', index === active ? 'text-primary-text/80' : 'text-muted-foreground')}>{hit.subtitle}</span>}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

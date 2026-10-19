import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useList } from '../data/use-list'
import { cn } from '../lib/cn'
import { Input } from '../primitives/input'
import { labelFieldOf } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { relationOptionsQuery, titleMatches } from './relation-options'
import { text as appText } from './messages'

export type RelationPickerProps = {
  target: ResourceModel
  view: ViewModel | undefined
  /** The chosen key, as text; empty for none. */
  value: string
  /** What to show for `value` while the box is closed. */
  label?: string
  /** The keys the list marks as chosen; `value` alone by default. */
  chosen?: string[]
  /** A choice keeps the list open and starts a new search, for picking several records. */
  several?: boolean
  invalid?: boolean
  onChange: (value: string, label: string) => void
}

/** Loads the next page while `sentinel` is in view of the list; it re-arms after each page, in case it still is. */
const useLoadMoreInView = (list: HTMLElement | null, sentinel: HTMLElement | null, loaded: number, loadMore: () => unknown) => {
  useEffect(() => {
    if (!list || !sentinel) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), { root: list })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [list, sentinel, loaded, loadMore])
}

/**
 * Picks a record of another resource: type to narrow the records by their search fields or title, scroll for more, and
 * choose with the mouse or with the arrow keys and Enter; Escape closes the list.
 */
export const RelationPicker = ({ target, view, value, label, chosen = [value], several = false, invalid, onChange }: RelationPickerProps) => {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [list, setList] = useState<HTMLUListElement | null>(null)
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null)
  const listId = useId()
  const keyField = target.primaryKey[0]!
  const labelField = labelFieldOf(target, view)
  // The scan guard refuses a filter no index serves; the picker then narrows the records itself.
  const [refused, setRefused] = useState(false)
  const query = relationOptionsQuery(target, labelField, text, refused)
  const rows = useList(target.name, { filter: query.filter, fields: [keyField, labelField], enabled: open })
  const expensive = query.filter !== undefined && rows.error instanceof ApiError && rows.error.slug === 'expensive-query'
  useEffect(() => {
    if (expensive) setRefused(true)
  }, [expensive])
  const items = query.local ? rows.items.filter((item) => titleMatches(item[labelField], text)) : rows.items
  const more = Boolean(rows.hasNextPage)
  const loading = rows.isPending || rows.isFetchingNextPage
  const { fetchNextPage } = rows
  // `cancelRefetch: false` keeps a page already on its way instead of asking for it again.
  useLoadMoreInView(list, sentinel, rows.items.length, useCallback(() => fetchNextPage({ cancelRefetch: false }), [fetchNextPage]))
  const optionId = (index: number) => `${listId}-${index}`
  const input = useRef<HTMLInputElement>(null)

  // Closed by a choice or Escape with the box still focused: its label is selected, so typing starts a new search.
  useEffect(() => {
    if (!open && document.activeElement === input.current) input.current?.select()
  }, [open])

  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  })

  const close = () => {
    setText('')
    setActive(-1)
    setOpen(false)
  }
  const choose = (item: Record<string, unknown>) => {
    onChange(String(item[keyField]), String(item[labelField]))
    if (!several) return close()
    setText('')
    setActive(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(Math.max(current + step, 0), items.length - 1))
      return
    }
    if (event.key === 'Enter' && open && items[active]) {
      event.preventDefault()
      choose(items[active])
      return
    }
    if (event.key === 'Escape' && open) {
      // The list closes, not a dialog the picker sits in.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  return (
    <div className="relative">
      <Input
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && items[active] ? optionId(active) : undefined}
        invalid={invalid}
        placeholder={appText('searchPlural', (view?.names?.plural ?? humanize(target.name)).toLowerCase())}
        value={open ? text : (label ?? value)}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setText(event.target.value)
          setActive(event.target.value.trim() ? 0 : -1)
          setOpen(true)
        }}
      />
      {open && (
        <ul
          ref={setList}
          id={listId}
          role="listbox"
          aria-multiselectable={several || undefined}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-background py-1 shadow-pop"
          onMouseDown={(event) => event.preventDefault()}
        >
          {items.map((item, index) => (
            <li
              key={String(item[keyField])}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={cn('cursor-pointer truncate px-3 py-1.5', index === active && 'bg-muted', chosen.includes(String(item[keyField])) && 'font-medium')}
              onMouseMove={() => index !== active && setActive(index)}
              onClick={() => choose(item)}
            >
              {String(item[labelField])}
            </li>
          ))}
          {more && <li ref={setSentinel} aria-hidden className="h-px" />}
          {rows.error && !expensive && <li className="px-3 py-1.5 text-muted-foreground">{appText('couldNotLoadOptions')}</li>}
          {!more && !loading && !rows.error && items.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{appText('noMatches')}</li>}
          {loading && <li className="px-3 py-1.5 text-muted-foreground">{appText('loading')}</li>}
        </ul>
      )}
    </div>
  )
}

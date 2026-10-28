import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { Input } from '../../primitives/input'
import { text as appText } from '../messages'

/** One choice in a picker's list: what it stores and what it reads as. */
export type PickerOption = { key: string; label: string }

/** What the box holds while it is open, and whether it is: its owner reads the options for them. */
export type PickerSearch = { text: string; setText: (text: string) => void; open: boolean; setOpen: (open: boolean) => void }

export const usePickerSearch = (): PickerSearch => {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  return { text, setText, open, setOpen }
}

export type PickerComboboxProps = {
  search: PickerSearch
  /** The options matching `search.text`, loaded so far. */
  options: PickerOption[]
  /** The keys the list marks as chosen. */
  chosen: string[]
  /** A choice keeps the list open and starts a new search, for picking several. */
  several: boolean
  /** What the box shows while it is closed. */
  closedText: string
  placeholder: string
  invalid?: boolean
  /** For options read a page at a time: whether more follow the `loaded` rows, which `loadMore` reads once the end of the list is in view. */
  paging?: { more: boolean; loaded: number; loadMore: () => unknown }
  loading: boolean
  /** The options could not be read. */
  failed: boolean
  onChoose: (option: PickerOption) => void
}

/** Loads the next page while `sentinel` is in view of the list; it re-arms after each page, in case it still is. */
const useLoadMoreInView = (list: HTMLElement | null, sentinel: HTMLElement | null, loaded: number, loadMore: (() => unknown) | undefined) => {
  useEffect(() => {
    if (!list || !sentinel || !loadMore) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), { root: list })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [list, sentinel, loaded, loadMore])
}

/**
 * A box to type in that lists the options its owner reads for the text: choose with the mouse or with the arrow keys
 * and Enter; Escape closes the list. The pickers of records and of members draw their lists with it.
 */
export const PickerCombobox = ({ search, options, chosen, several, closedText, placeholder, invalid, paging, loading, failed, onChoose }: PickerComboboxProps) => {
  const { text, setText, open, setOpen } = search
  const [active, setActive] = useState(-1)
  const [list, setList] = useState<HTMLUListElement | null>(null)
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null)
  const listId = useId()
  const more = paging?.more ?? false
  useLoadMoreInView(list, sentinel, paging?.loaded ?? 0, paging?.loadMore)
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
  const choose = (option: PickerOption) => {
    onChoose(option)
    if (!several) return close()
    setText('')
    setActive(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(Math.max(current + step, 0), options.length - 1))
      return
    }
    if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault()
      choose(options[active])
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
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        invalid={invalid}
        placeholder={placeholder}
        value={open ? text : closedText}
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
          {options.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={cn('cursor-pointer truncate px-3 py-1.5', index === active && 'bg-muted', chosen.includes(option.key) && 'font-medium')}
              onMouseMove={() => index !== active && setActive(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </li>
          ))}
          {more && <li ref={setSentinel} aria-hidden className="h-px" />}
          {failed && <li className="px-3 py-1.5 text-muted-foreground">{appText('couldNotLoadOptions')}</li>}
          {!more && !loading && !failed && options.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{appText('noMatches')}</li>}
          {loading && <li className="px-3 py-1.5 text-muted-foreground">{appText('loading')}</li>}
        </ul>
      )}
    </div>
  )
}

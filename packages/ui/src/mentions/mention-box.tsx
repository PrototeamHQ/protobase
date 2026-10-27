import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { menuKeyTarget } from '../primitives/menu-keys'
import { Textarea, type TextareaProps } from '../primitives/textarea'
import { activeMention, insertMention, type PickedUser } from './mention-text'
import { PeopleList } from './people-list'
import { usePeopleSearch, type PeopleSearch } from './use-people-search'

/** What is written in a mention box: the text, and the people picked from its list, whom `@{name}` in it mentions. */
export type MentionDraft = { text: string; picked: readonly PickedUser[] }

export const emptyDraft: MentionDraft = { text: '', picked: [] }

export type MentionBoxProps = Omit<TextareaProps, 'value' | 'onChange' | 'onKeyDown' | 'role'> & {
  value: MentionDraft
  onChange: (draft: MentionDraft) => void
  /** Finds the people `@` lists by the name typed after it; without it, `@` is plain text. */
  searchPeople?: PeopleSearch
  /** Where the list opens: under the box, or above it for a box at the bottom of a chat. */
  listAt?: 'below' | 'above'
  /** The keys the open list does not take, such as Enter to send. */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

/** The most people the list offers; few enough that it never needs a scrollbar of its own. */
const shownPeople = 8

/**
 * A text box of several lines in which typing `@` lists the people `searchPeople` finds by the name typed after it:
 * the arrows move, Enter or Tab picks, Escape closes. A picked name is written out as `@{name} `.
 */
export const MentionBox = ({ value, onChange, searchPeople, listAt = 'below', onKeyDown, onFocus, onBlur, ref: given, ...rest }: MentionBoxProps) => {
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  // The start of the mention Escape closed, which stays closed until another one starts
  const [closed, setClosed] = useState<number>()
  const box = useRef<HTMLTextAreaElement>(null)
  const setBox = useCallback(
    (element: HTMLTextAreaElement | null) => {
      box.current = element
      if (typeof given === 'function') given(element)
      else if (given) given.current = element
    },
    [given],
  )
  const nextCaret = useRef<number>(undefined)
  const listId = useId()

  const mention = searchPeople ? activeMention(value.text, caret) : undefined
  const open = focused && mention !== undefined && mention.start !== closed
  const found = usePeopleSearch(searchPeople, open ? mention.query : undefined)
  const options = open && found && 'people' in found ? found.people.slice(0, shownPeople) : []
  const listed = open && found !== undefined
  const optionId = (index: number) => `${listId}-${index}`

  useEffect(() => setActive(0), [mention?.query])
  // A mention Escape closed is done with once the caret leaves it
  const mentionStart = mention?.start
  useEffect(() => {
    if (mentionStart === undefined) setClosed(undefined)
  }, [mentionStart])
  // A picked name moves the caret behind it once the box shows the new text
  useLayoutEffect(() => {
    if (nextCaret.current === undefined || !box.current) return
    box.current.setSelectionRange(nextCaret.current, nextCaret.current)
    setCaret(nextCaret.current)
    nextCaret.current = undefined
  }, [value.text])

  const pick = (user: PickedUser) => {
    if (!mention) return
    const next = insertMention(value.text, mention, user.name)
    nextCaret.current = next.caret
    onChange({ text: next.text, picked: [...value.picked, user] })
  }

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      const target = menuKeyTarget(event.key, active, options.length)
      if (target !== undefined && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        setActive(target)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && options[active]) {
        event.preventDefault()
        pick(options[active])
        return
      }
      if (event.key === 'Escape') {
        // The list closes, not the page's edit mode or a dialog the box sits in
        event.preventDefault()
        event.stopPropagation()
        setClosed(mention.start)
        return
      }
    }
    onKeyDown?.(event)
  }

  const combobox = searchPeople && {
    role: 'combobox',
    'aria-multiline': true,
    'aria-autocomplete': 'list',
    'aria-expanded': listed,
    'aria-controls': listId,
    'aria-activedescendant': listed && options[active] ? optionId(active) : undefined,
  } as const

  return (
    <div className="relative">
      <Textarea
        {...rest}
        {...combobox}
        ref={setBox}
        value={value.text}
        onChange={(event) => {
          onChange({ ...value, text: event.target.value })
          setCaret(event.target.selectionStart)
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        onKeyDown={keyDown}
      />
      {listed && (
        <PeopleList id={listId} optionId={optionId} people={options} active={active} onActive={setActive} onPick={pick} failed={'failed' in found} at={listAt} />
      )}
    </div>
  )
}

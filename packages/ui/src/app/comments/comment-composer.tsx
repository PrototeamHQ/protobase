import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../../primitives/button'
import { menuKeyTarget } from '../../primitives/menu-keys'
import { Textarea } from '../../primitives/textarea'
import { useToast } from '../../toasts/toast-provider'
import { refusalReason } from '../displays/board-columns'
import { activeMention, insertMention, mentionedIds, type PickedUser } from './mention-text'
import { useMentionable } from './use-mentionable'
import { usePostComment } from './use-post-comment'
import { text } from './messages'

/** The most people the list offers; few enough that it never needs a scrollbar of its own. */
const shownPeople = 8

/**
 * The box a comment is written in. Typing `@` lists the people who may read the record by the name typed after it:
 * the arrows move, Enter or Tab picks, Escape closes. ⌘/Ctrl+Enter or the button posts.
 */
export const CommentComposer = ({ resource, recordKey }: { resource: string; recordKey: string }) => {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [picked, setPicked] = useState<PickedUser[]>([])
  const [active, setActive] = useState(0)
  // The start of the mention Escape closed, which stays closed until another one starts
  const [closed, setClosed] = useState<number>()
  const box = useRef<HTMLTextAreaElement>(null)
  const nextCaret = useRef<number>(undefined)
  const listId = useId()
  const toast = useToast()
  const post = usePostComment(resource, recordKey)

  const mention = activeMention(draft, caret)
  const open = focused && mention !== undefined && mention.start !== closed
  const people = useMentionable(resource, recordKey, open ? mention.query : undefined)
  const options = open ? (people.data ?? []).slice(0, shownPeople) : []
  const listed = open && people.data !== undefined
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
  }, [draft])

  const pick = (user: PickedUser) => {
    if (!mention) return
    const next = insertMention(draft, mention, user.name)
    nextCaret.current = next.caret
    setDraft(next.text)
    setPicked((current) => [...current, user])
  }

  const submit = () => {
    if (draft.trim() === '' || post.isPending) return
    post.mutate(
      { body: draft, mentions: mentionedIds(draft, picked) },
      {
        onSuccess: () => {
          setDraft('')
          setPicked([])
        },
        onError: (error) => toast.show({ state: 'error', title: text('couldNotPost'), description: refusalReason(error) }),
      },
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
      return
    }
    if (!open) return
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
      // The list closes, not the page's edit mode or a dialog the record sits in
      event.preventDefault()
      event.stopPropagation()
      setClosed(mention.start)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          ref={box}
          role="combobox"
          aria-label={text('comment')}
          aria-multiline
          aria-autocomplete="list"
          aria-expanded={listed}
          aria-controls={listId}
          aria-activedescendant={listed && options[active] ? optionId(active) : undefined}
          placeholder={text('placeholder')}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setCaret(event.target.selectionStart)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {listed && (
          <ul id={listId} role="listbox" aria-label={text('peopleToMention')} className="absolute z-30 mt-1 w-full max-w-sm rounded-md border bg-background py-1 shadow-pop" onMouseDown={(event) => event.preventDefault()}>
            {options.map((user, index) => (
              <li
                key={user.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={cn('cursor-pointer truncate px-3 py-1.5', index === active && 'bg-muted')}
                onMouseMove={() => index !== active && setActive(index)}
                onClick={() => pick(user)}
              >
                {user.name}
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{text('noOneFound')}</li>}
          </ul>
        )}
      </div>
      <div>
        <Button variant="primary" size="sm" disabled={draft.trim() === ''} loading={post.isPending} onClick={submit}>
          {text('comment')}
        </Button>
      </div>
    </div>
  )
}

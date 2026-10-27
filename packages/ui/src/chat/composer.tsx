import { SendHorizontal } from 'lucide-react'
import { useState, type KeyboardEvent, type Ref } from 'react'
import { emptyDraft, MentionBox, mentionedIds, type MentionDraft, type PeopleSearch } from '../mentions'
import { Button } from '../primitives/button'
import { text } from './messages'

export type ComposerProps = {
  /** Gets the trimmed text and the ids of the people it mentions, each once. */
  onSend?: (text: string, mentions: string[]) => void
  /** The other side is still answering: the text can be written but not sent. */
  busy?: boolean
  placeholder?: string
  inputRef?: Ref<HTMLTextAreaElement>
  /** Finds the people `@` lists by the name typed after it, such as a channel's members; without it, `@` is plain text. */
  searchPeople?: PeopleSearch
}

/**
 * The text box under a chat, which grows with its text. Enter or the button sends the trimmed text and clears the box,
 * Shift+Enter starts a new line; while the list of people to mention is open, Enter picks from it instead.
 */
export const Composer = ({ onSend, busy, placeholder, inputRef, searchPeople }: ComposerProps) => {
  const [draft, setDraft] = useState<MentionDraft>(emptyDraft)
  const message = draft.text.trim()
  const send = () => {
    if (!message || busy) return
    onSend?.(message, mentionedIds(message, draft.picked))
    setDraft(emptyDraft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an input method composes a word confirms the word, and Shift+Enter is a line break
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <div className="min-w-0 flex-1">
        <MentionBox ref={inputRef} rows={1} aria-label={text('message')} placeholder={placeholder} value={draft} onChange={setDraft} searchPeople={searchPeople} listAt="above" onKeyDown={onKeyDown} />
      </div>
      <Button type="submit" variant="primary" className="w-8 px-0" aria-label={text('send')} disabled={!message || busy}>
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}

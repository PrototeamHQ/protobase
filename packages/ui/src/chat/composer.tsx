import { SendHorizontal } from 'lucide-react'
import { useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { emptyDraft, MentionBox, mentionedIds, type MentionDraft, type PeopleSearch } from '../mentions'
import { Button } from '../primitives/button'
import { carriesFiles, pastedFiles } from './composer-files'
import { canSend } from './composer-send'
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
  /** Drawn inside the composer above the box, such as a tray of the files picked for the message. */
  attachments?: ReactNode
  /** Drawn left of the box, such as a button that picks files. */
  actions?: ReactNode
  /** Enter and the button send even with no text, `onSend('', [])`, such as when files are picked. */
  canSendEmpty?: boolean
  /** Gets the files pasted into the box or dropped on the composer; the composer itself uploads and sends nothing. A paste that holds text stays text. */
  onFiles?: (files: File[]) => void
}

/**
 * The text box under a chat, which grows with its text. Enter or the button sends the trimmed text and clears the box,
 * Shift+Enter starts a new line; while the list of people to mention is open, Enter picks from it instead. With `canSendEmpty`,
 * such as while files are picked, it sends with no text too.
 */
export const Composer = ({ onSend, busy, placeholder, inputRef, searchPeople, attachments, actions, canSendEmpty, onFiles }: ComposerProps) => {
  const [draft, setDraft] = useState<MentionDraft>(emptyDraft)
  const message = draft.text.trim()
  const sendable = canSend(message, { busy, canSendEmpty })
  const send = () => {
    if (!sendable) return
    onSend?.(message, mentionedIds(message, draft.picked))
    setDraft(emptyDraft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an input method composes a word confirms the word, and Shift+Enter is a line break
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onFiles) return
    const files = pastedFiles(event.clipboardData)
    if (files.length === 0) return
    event.preventDefault()
    onFiles(files)
  }
  // A drag of text goes on to the box as usual; only a drag of files is the composer's
  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!onFiles || !carriesFiles(event.dataTransfer)) return
    event.preventDefault()
  }
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    if (!onFiles || !carriesFiles(event.dataTransfer)) return
    event.preventDefault()
    onFiles([...event.dataTransfer.files])
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {attachments && <div className="basis-full">{attachments}</div>}
      {actions}
      <div className="min-w-0 flex-1">
        <MentionBox ref={inputRef} rows={1} aria-label={text('message')} placeholder={placeholder} value={draft} onChange={setDraft} searchPeople={searchPeople} listAt="above" onKeyDown={onKeyDown} onPaste={onPaste} />
      </div>
      <Button type="submit" variant="primary" className="w-8 px-0" aria-label={text('send')} disabled={!sendable}>
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}

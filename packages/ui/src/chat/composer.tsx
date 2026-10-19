import { SendHorizontal } from 'lucide-react'
import { useState, type Ref } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { text } from './messages'

export type ComposerProps = {
  onSend?: (text: string) => void
  /** The other side is still answering: the text can be written but not sent. */
  busy?: boolean
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
}

/** The text box under a chat. Enter or the button sends the trimmed text and clears the box. */
export const Composer = ({ onSend, busy, placeholder, inputRef }: ComposerProps) => {
  const [draft, setDraft] = useState('')
  const message = draft.trim()
  const send = () => {
    if (!message || busy) return
    onSend?.(message)
    setDraft('')
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Input ref={inputRef} aria-label={text('message')} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} wrapperClassName="flex-1" />
      <Button type="submit" variant="primary" className="w-8 px-0" aria-label={text('send')} disabled={!message || busy}>
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}

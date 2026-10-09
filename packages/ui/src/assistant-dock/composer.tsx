import { SendHorizontal } from 'lucide-react'
import { useState, type Ref } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'

export type ComposerProps = {
  onSend?: (text: string) => void
  /** The assistant is still replying; the text can be written but not sent. */
  replying?: boolean
  placeholder: string
  inputRef?: Ref<HTMLInputElement>
}

export const Composer = ({ onSend, replying, placeholder, inputRef }: ComposerProps) => {
  const [text, setText] = useState('')
  const message = text.trim()
  const send = () => {
    if (!message || replying) return
    onSend?.(message)
    setText('')
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Input ref={inputRef} aria-label="Message" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} wrapperClassName="flex-1" />
      <Button type="submit" variant="primary" className="w-8 px-0" aria-label="Send" disabled={!message || replying}>
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}

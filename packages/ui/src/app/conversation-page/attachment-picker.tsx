import { Paperclip } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '../../primitives/button'
import { text } from './messages'

type Props = {
  onPick: (files: File[]) => void
  /** The file field's accepted types, as the file input takes them. */
  accept?: string
}

/** A button left of the message box that opens the browser's file picker, giving the files the reader picks. */
export const AttachmentPicker = ({ onPick, accept }: Props) => {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={accept}
        aria-label={text('filesToAttach')}
        onChange={(event) => {
          onPick([...(event.target.files ?? [])])
          // Picking the same file again after taking it off is a change too
          event.target.value = ''
        }}
      />
      <Button type="button" variant="ghost" size="icon" aria-label={text('attachFiles')} title={text('attachFiles')} onClick={() => input.current?.click()}>
        <Paperclip className="size-4" />
      </Button>
    </>
  )
}

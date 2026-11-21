import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../../primitives/button'
import { uploadState, type Upload } from './uploads'
import { text } from './messages'

type Props = {
  uploads: readonly Upload[]
  onRemove: (key: number) => void
}

/**
 * The files picked, pasted or dropped for the next message, above the box: each with its size, how far its upload is,
 * or why it was refused, and a button that takes it off.
 */
export const PendingAttachments = ({ uploads, onRemove }: Props) => (
  <ul aria-label={text('filesToSend')} className="flex flex-wrap gap-2">
    {uploads.map((upload) => (
      <li key={upload.key} className="flex max-w-full items-center gap-1 rounded-md border border-border py-0.5 pl-2 text-sm">
        <span className="min-w-0 max-w-48 truncate">{upload.name}</span>
        <span role={upload.refusal === undefined ? undefined : 'alert'} className={cn('min-w-0', upload.refusal === undefined ? 'text-muted-foreground' : 'text-danger-text')}>
          {uploadState(upload)}
        </span>
        <Button type="button" variant="ghost" size="icon" aria-label={text('takeFileOff', { name: upload.name })} title={text('takeFileOff', { name: upload.name })} onClick={() => onRemove(upload.key)}>
          <X className="size-3.5" />
        </Button>
      </li>
    ))}
  </ul>
)

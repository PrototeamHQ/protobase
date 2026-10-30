import { X } from 'lucide-react'
import { text } from './messages'

export type TokenProps = { label: string; onRemove: () => void }

/** A chosen value as a small token with a button that takes it off; the button keeps the focus where it is. */
export const Token = ({ label, onRemove }: TokenProps) => (
  <span className="inline-flex h-5 max-w-full items-center gap-0.5 rounded bg-primary-soft pl-1.5 pr-0.5 text-xs font-medium text-primary-text">
    <span className="truncate">{label}</span>
    <button type="button" aria-label={text('remove', { label })} className="rounded p-0.5 hover:bg-primary-border/60" onMouseDown={(event) => event.preventDefault()} onClick={onRemove}>
      <X className="size-3" />
    </button>
  </span>
)

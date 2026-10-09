import { useState } from 'react'
import { cn } from '../lib/cn'

export type NumberCellProps = {
  value: number
  onCommit: (value: number) => void
  format: (value: number) => string
  parse: (text: string) => number
  label: string
  width?: string
}

export const NumberCell = ({ value, onCommit, format, parse, label, width = 'w-full' }: NumberCellProps) => {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const parsed = parse(draft)
    setDraft(null)
    if (Number.isFinite(parsed) && parsed >= 0) onCommit(parsed)
  }

  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? format(value)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      className={cn(
        'h-7 rounded-md border border-transparent bg-transparent px-2 text-right text-[13px] tabular-nums text-foreground outline-none hover:border-border-strong focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20',
        width,
      )}
    />
  )
}

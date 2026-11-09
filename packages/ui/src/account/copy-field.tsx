import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { text } from './messages'

/** A value to copy, such as an address or a new token, in a box with a button that copies it and says so for a moment. */
export const CopyField = ({ value, copyLabel }: { value: string; copyLabel: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-surface py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
      <button
        type="button"
        aria-label={copied ? text('copied') : copyLabel}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted pointer-coarse:size-11"
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

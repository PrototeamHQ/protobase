import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { text } from './messages'

/**
 * A value to copy, such as an address or a new token, in a box with a button that copies it and says so for a moment.
 * Where the browser refuses the clipboard, such as on a page that is not https or without the permission, it says to
 * copy the value by hand, which stays shown.
 */
export const CopyField = ({ value, copyLabel }: { value: string; copyLabel: string }) => {
  const [copied, setCopied] = useState<'yes' | 'refused'>()
  useEffect(() => {
    if (copied !== 'yes') return
    const timer = setTimeout(() => setCopied(undefined), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    // A page that is not a secure context has no clipboard at all.
    if (!navigator.clipboard) return setCopied('refused')
    void navigator.clipboard.writeText(value).then(
      () => setCopied('yes'),
      (failure: unknown) => {
        if (!(failure instanceof DOMException)) throw failure
        setCopied('refused')
      },
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 rounded-md border bg-surface py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
        <button
          type="button"
          aria-label={copied === 'yes' ? text('copied') : copyLabel}
          onClick={copy}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted pointer-coarse:size-11"
        >
          {copied === 'yes' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
      {copied === 'refused' && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-text">
          {text('copyRefused')}
        </p>
      )}
    </div>
  )
}

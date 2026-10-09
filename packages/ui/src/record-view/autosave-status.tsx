import { AlertCircle, Check } from 'lucide-react'
import { formatAgo } from '../format'
import { Spinner } from '../primitives/spinner'

export type AutosaveStatusProps = { state: 'saving' | 'saved' | 'error'; agoSeconds: number }

export const AutosaveStatus = ({ state, agoSeconds }: AutosaveStatusProps) => (
  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
    {state === 'saving' && (
      <>
        <Spinner className="size-3.5" />
        Saving...
      </>
    )}
    {state === 'saved' && (
      <>
        <Check className="size-3.5 text-success" />
        Saved {formatAgo(agoSeconds)}
      </>
    )}
    {state === 'error' && (
      <>
        <AlertCircle className="size-3.5 text-danger" />
        <span className="text-danger-text">Not saved, retrying</span>
      </>
    )}
  </span>
)

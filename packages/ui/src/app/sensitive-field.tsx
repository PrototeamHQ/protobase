import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { cn } from '../lib/cn'
import { displayValue } from '../live/display-value'
import { toDraft } from '../live/field-values'
import { humanize } from '../live/naming'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { ErrorBanner } from './error-banner'

const mask = '••••••••••'

export type SensitiveFieldProps = {
  field: FieldModel
  hints?: FieldViewModel
  /** The draft text: empty until the user types a new value. */
  value: unknown
  /** Fetches the stored value from the server, which audits it; without it (a new record) the eye only unmasks what was typed. */
  reveal?: () => Promise<unknown>
  locked?: boolean
  invalid?: boolean
  placeholder?: string
  onChange: (value: unknown) => void
}

/** A value hidden like a password. Showing a stored one asks the server for it, once per page visit. */
export const SensitiveField = ({ field, hints, value, reveal, locked, invalid, placeholder, onChange }: SensitiveFieldProps) => {
  const [shown, setShown] = useState(false)
  const stored = useMutation({ mutationFn: async () => reveal!(), onSuccess: () => setShown(true) })
  const typed = toDraft(value) !== ''
  const label = hints?.label ?? humanize(field.name)
  const toggle = () => {
    if (shown || typed || !reveal || stored.isSuccess) setShown(!shown)
    else stored.mutate()
  }
  const eye = (
    <Button variant="ghost" size="sm" className="-mr-1.5 px-1.5" aria-label={`${shown ? 'Hide' : 'Show'} ${label}`} aria-pressed={shown} loading={stored.isPending} onClick={toggle}>
      {!stored.isPending && (shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />)}
    </Button>
  )
  const error = stored.error && <div className="mt-2"><ErrorBanner title={`Could not show the ${label}`} error={stored.error} /></div>

  if (locked) {
    return (
      <div>
        <div className="flex items-center gap-2 py-1 text-[13px]">
          <span className={cn(shown ? (hints?.format === 'code' ? 'font-mono text-xs' : '') : 'tracking-widest text-muted-foreground')}>{shown ? displayValue(field, stored.data, hints) : mask}</span>
          {reveal && eye}
        </div>
        {error}
      </div>
    )
  }
  const text = typed ? toDraft(value) : shown && stored.isSuccess ? toDraft(stored.data) : ''
  return (
    <div>
      <Input
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        invalid={invalid}
        aria-label={label}
        className={cn(hints?.format === 'code' && 'font-mono text-xs')}
        placeholder={typed || !reveal ? placeholder : mask}
        value={text}
        trailing={eye}
        onChange={(event) => onChange(event.target.value)}
      />
      {error}
    </div>
  )
}

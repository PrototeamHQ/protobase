import { TriangleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { FieldControlContext } from '../primitives/field-control'
import { text } from './messages'

export type FieldConflict = { user: { name: string; initials: string; hue: number }; ago: string; theirValue: string; onKeepMine: () => void; onUseTheirs: () => void }

export type FieldProps = {
  /** The control's name, for the browser's autofill. */
  name?: string
  label: string
  /** Marks the label with an asterisk. */
  required?: boolean
  help?: string
  example?: string
  error?: string
  conflict?: FieldConflict
  /** Takes the whole row of a grid of two columns, as a text of several lines does. */
  wide?: boolean
  children: ReactNode
}

/**
 * A labelled form field. The `Input` or `Textarea` inside takes its label, its name, the help and error that describe
 * it and whether it is invalid or required from the field; another control uses `useFieldControl`.
 */
export const Field = ({ name, label, required, help, example, error, conflict, wide, children }: FieldProps) => {
  const id = useId()
  const describedBy = [help && `${id}-help`, example && `${id}-example`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <div className="mb-1.5 flex items-center gap-2">
        <label htmlFor={id} className="font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-danger-text" aria-hidden="true">*</span>}
        </label>
        {conflict && (
          <span className="inline-flex items-center gap-1.5 text-warning-text" title={text('savedDifferent', conflict.user.name)}>
            <TriangleAlert className="size-3.5" />
            <Avatar initials={conflict.user.initials} hue={conflict.user.hue} size="xs" />
          </span>
        )}
      </div>
      <FieldControlContext value={{ id, name, describedBy, invalid: Boolean(error), required: Boolean(required) }}>{children}</FieldControlContext>
      {help && <p id={`${id}-help`} className="mt-1.5 text-xs text-muted-foreground">{help}</p>}
      {example && <p id={`${id}-example`} className="mt-0.5 text-xs text-faint-foreground">{text('example')} {example}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger-text">{error}</p>}
      {conflict && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-text">
          <span>
            <strong>{conflict.user.name}</strong> {text('savedThis', conflict.ago)} <strong>{conflict.theirValue}</strong>
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" onClick={conflict.onKeepMine}>{text('keepMine')}</Button>
            <Button size="sm" onClick={conflict.onUseTheirs}>{text('useTheirs')}</Button>
          </span>
        </div>
      )}
    </div>
  )
}

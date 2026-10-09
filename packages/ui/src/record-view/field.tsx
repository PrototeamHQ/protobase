import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'

export type FieldConflict = { user: { name: string; initials: string; hue: number }; ago: string; theirValue: string; onKeepMine: () => void; onUseTheirs: () => void }

export type FieldProps = {
  label: string
  /** Marks the label with an asterisk. */
  required?: boolean
  help?: string
  example?: string
  error?: string
  conflict?: FieldConflict
  children: ReactNode
}

export const Field = ({ label, required, help, example, error, conflict, children }: FieldProps) => (
  <div>
    <div className="mb-1.5 flex items-center gap-2">
      <label className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger-text" aria-label="required">*</span>}
      </label>
      {conflict && (
        <span className="inline-flex items-center gap-1.5 text-warning-text" title={`${conflict.user.name} saved a different value`}>
          <TriangleAlert className="size-3.5" />
          <Avatar initials={conflict.user.initials} hue={conflict.user.hue} size="xs" />
        </span>
      )}
    </div>
    {children}
    {help && <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>}
    {example && <p className="mt-0.5 text-xs text-faint-foreground">Example: {example}</p>}
    {error && <p className="mt-1.5 text-xs font-medium text-danger-text">{error}</p>}
    {conflict && (
      <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-text">
        <span>
          <strong>{conflict.user.name}</strong> saved this {conflict.ago}: <strong>{conflict.theirValue}</strong>
        </span>
        <span className="flex gap-1.5">
          <Button size="sm" onClick={conflict.onKeepMine}>Keep mine</Button>
          <Button size="sm" onClick={conflict.onUseTheirs}>Use theirs</Button>
        </span>
      </div>
    )}
  </div>
)

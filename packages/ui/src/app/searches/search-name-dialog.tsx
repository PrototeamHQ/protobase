import { useId, useState } from 'react'
import type { FilterChip } from '../../filter-panel'
import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { FilterChipList } from './filter-chip-list'

type SearchNameDialogProps = {
  /** What the dialog does, such as "Save search" or "Rename Gardens". */
  title: string
  /** What the search filters on. */
  chips: readonly FilterChip[]
  /** The name field's label, from the saved searches' view. */
  label: string
  /** Whether the name may be left empty: a field without `.optional()` needs one. */
  required: boolean
  initial?: string
  busy: boolean
  /** The name as entered, trimmed, or `null` when it is left empty. */
  onSave: (name: string | null) => void
  onClose: () => void
}

/** Asks for a saved search's name, empty unless the field needs one, showing what the search filters on. */
export const SearchNameDialog = ({ title, chips, label, required, initial = '', busy, onSave, onClose }: SearchNameDialogProps) => {
  const id = useId()
  const [name, setName] = useState(initial)
  const formId = `${id}-form`
  return (
    <ResponsiveDialog
      open
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(name.trim() === '' ? null : name.trim())
        }}
      >
        {chips.length > 0 && <FilterChipList chips={chips} />}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={id} className="font-medium">
              {label}
            </label>
            {!required && (
              <span id={`${id}-hint`} className="text-xs text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <Input
            id={id}
            value={name}
            required={required}
            pattern={required ? '.*\\S.*' : undefined}
            aria-describedby={required ? undefined : `${id}-hint`}
            autoFocus
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

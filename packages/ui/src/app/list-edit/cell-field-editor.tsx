import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { differs, toFieldDraft, toPatchValue } from '../../live/field-values'
import { FieldEditor } from '../field-editor'

export type CellFieldEditorProps = {
  field: FieldModel
  hints: FieldViewModel | undefined
  /** The resource the field belongs to. */
  resource: string
  /** The value the cell shows. */
  stored: unknown
  /** Saves the new value, as the API takes it. */
  onSave: (value: unknown) => void
  /** Leaves the cell, going on to the next or previous editable cell of the row with `move`. */
  close: (move?: 1 | -1) => void
}

/**
 * A field's editor in a list cell, the one the record page uses: Enter, Tab and leaving the cell save a change, and Tab
 * and Shift+Tab go on to the next or previous editable cell; Escape leaves it as it was. A built-in switch or choice
 * saves as soon as it changes.
 */
export const CellFieldEditor = ({ field, hints, resource, stored, onSave, close }: CellFieldEditorProps) => {
  const [draft, setDraft] = useState(() => toFieldDraft(field, stored))
  const ref = useRef<HTMLDivElement>(null)
  const finished = useRef(false)
  const instant = !hints?.widget && (field.type === 'boolean' || field.type === 'enum')

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]')?.focus()
  }, [])

  const finish = (save: boolean, move?: 1 | -1, value = draft) => {
    if (finished.current) return
    finished.current = true
    if (save && differs(field, value, stored)) onSave(toPatchValue(field, value))
    close(move)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      finish(true, event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }
  }

  const onBlur = (event: FocusEvent) => {
    if (!ref.current?.contains(event.relatedTarget as Node | null)) finish(true)
  }

  const onChange = (next: unknown) => {
    setDraft(next as typeof draft)
    if (instant) finish(true, undefined, next as typeof draft)
  }

  return (
    <div ref={ref} className="w-full min-w-0" onKeyDown={onKeyDown} onBlur={onBlur}>
      <FieldEditor field={field} hints={hints} value={draft} stored={stored} resource={resource} onChange={onChange} />
    </div>
  )
}

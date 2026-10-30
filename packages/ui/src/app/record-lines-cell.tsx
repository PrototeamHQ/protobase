import { useId } from 'react'
import type { ProblemError } from '@protobase/client'
import type { AppAddress, FieldModel, FieldViewModel, ResourceModel, ViewModel } from '@protobase/schema'
import { FieldControlContext } from '../primitives/field-control'
import { FieldEditor } from './field-editor'
import { fieldMessage } from './field-errors'
import { text } from './record-messages'

export type LineCellProps = {
  field: FieldModel
  hints: FieldViewModel | undefined
  /** The column's label, which names the cell to a screen reader with the line's number. */
  label: string
  lineNumber: number
  resource: string
  value: unknown
  stored: unknown
  relationLabel?: string
  relationTo?: AppAddress
  relationPicker?: { target: ResourceModel; view: ViewModel | undefined }
  locked: boolean
  /** The server's problem with this field of the line, from the last save. */
  problem?: ProblemError
  onChange: (next: unknown) => void
}

/** One field of a line, edited with the record page's own editor; its label is for screen readers, as the column heading shows it. */
export const LineCell = ({ field, hints, label, lineNumber, resource, value, stored, relationLabel, relationTo, relationPicker, locked, problem, onChange }: LineCellProps) => {
  const id = useId()
  const message = problem && fieldMessage(field, label, problem)
  return (
    <FieldControlContext.Provider value={{ id, invalid: Boolean(problem), required: false, ...(message && { describedBy: `${id}-error` }) }}>
      <label htmlFor={id} className="sr-only">
        {text('lineField', label, lineNumber)}
      </label>
      <FieldEditor
        field={field}
        hints={hints}
        value={value}
        stored={stored}
        relationLabel={relationLabel}
        relationTo={relationTo}
        relationPicker={relationPicker}
        locked={locked}
        invalid={Boolean(problem)}
        resource={resource}
        onChange={onChange}
      />
      {message && (
        <p id={`${id}-error`} className="px-1 pt-0.5 text-xs text-danger-text">
          {message}
        </p>
      )}
    </FieldControlContext.Provider>
  )
}

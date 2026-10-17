import { createContext, useContext } from 'react'

export type FieldControl = {
  id: string
  /** The form field's name, for the browser's autofill. */
  name?: string
  /** The ids of the help, example and error under the field. */
  describedBy?: string
  invalid: boolean
  required: boolean
}

/** Set by a form's `Field` for the control inside it. */
export const FieldControlContext = createContext<FieldControl | undefined>(undefined)

/**
 * The attributes that tie a control to the `Field` around it: the id its label points at, its name, the help and error
 * that describe it, and whether it is invalid or required. None outside a `Field`.
 */
export const useFieldControl = () => {
  const control = useContext(FieldControlContext)
  if (!control) return {}
  return {
    id: control.id,
    name: control.name,
    'aria-describedby': control.describedBy,
    'aria-invalid': control.invalid || undefined,
    'aria-required': control.required || undefined,
  }
}

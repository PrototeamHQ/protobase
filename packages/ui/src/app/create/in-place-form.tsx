import type { FormEvent, ReactNode } from 'react'
import { Field } from '../../record-view/field'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'
import type { CreateForm } from './use-create-form'
import { text } from './messages'

export type InPlaceFormProps = {
  form: CreateForm
  /** The fields to show, by name, of the form's; the others keep what the form was given. */
  fields: readonly string[]
  /** The submit button's label. */
  submit: string
  /** The submit button cannot be pressed. */
  disabled?: boolean
  /** Sends the form; `form.submit()` when omitted. */
  onSubmit?: () => void
  /** What the form says above its fields, or inputs of the caller's own. */
  children?: ReactNode
}

/**
 * A create form that stays where it is, for a focus page's panel or a dialog: the named fields of `useCreateForm`, its
 * failure and its submit button, so an action is done beside what it acts on, with no page of its own. `onCreated`
 * says what comes next.
 */
export const InPlaceForm = ({ form, fields, submit, disabled, onSubmit, children }: InPlaceFormProps) => {
  const shown = form.sections.flatMap((section) => section.fields).filter((field) => fields.includes(field.name))
  const send = (event: FormEvent) => {
    event.preventDefault()
    if (onSubmit) onSubmit()
    else void form.submit()
  }
  return (
    <form ref={form.ref} className="flex flex-col gap-4" onSubmit={send}>
      {form.message && <ErrorBanner title={text('notCreated')} error={new Error(form.message)} />}
      {children}
      {shown.map((field) => (
        <Field key={field.name} name={field.name} label={field.label} required={field.required} help={field.help} error={field.error} wide={field.wide}>
          {field.editor}
        </Field>
      ))}
      <Button variant="primary" type="submit" className="max-md:min-h-11" loading={form.saving} disabled={disabled}>
        {submit}
      </Button>
    </form>
  )
}

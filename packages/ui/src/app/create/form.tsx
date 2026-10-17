import type { FormEvent, ReactNode } from 'react'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'

export type FormProps = {
  /**
   * The heading, such as "New repair", when the form is the whole page, as the create form is: the heading and its
   * buttons on top. Without it, the form sits in a page with a heading of its own, a composed page's, and its buttons
   * follow the sections.
   */
  title?: string
  /** The line above the heading, such as the records' name. */
  eyebrow?: string
  /** The submit button's label, such as "Create repair". */
  submit: string
  /** The submit button spins and cannot be pressed again. */
  saving?: boolean
  /** The submit button cannot be pressed, while the answers are not complete. */
  disabled?: boolean
  /** A failure that belongs to no field, shown above the sections; an API error shows its messages and hints. */
  error?: unknown
  /** The failure's title. */
  errorTitle?: string
  onSubmit: () => void
  /** Shows Cancel beside the submit button. */
  onCancel?: () => void
  /** The form's sections (`Section`), drawn one under the other with a line between them. */
  children: ReactNode
}

/** The frame of the app's forms: Cancel and the submit button, a failure that belongs to no field, and the sections. */
export const Form = ({ title, eyebrow, submit, saving, disabled, error, errorTitle = 'Not saved', onSubmit, onCancel, children }: FormProps) => {
  const buttons = (
    <div className="flex items-center gap-2">
      {onCancel && <Button className="max-sm:min-h-11" onClick={onCancel}>Cancel</Button>}
      <Button variant="primary" type="submit" className="max-sm:min-h-11 max-sm:flex-1" loading={saving} disabled={disabled}>
        {submit}
      </Button>
    </div>
  )
  const failure = error !== undefined && (
    <div className="mt-4">
      <ErrorBanner title={errorTitle} error={error} />
    </div>
  )
  const sections = <div className="divide-y divide-border">{children}</div>
  const send = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  if (title === undefined) {
    return (
      <form className="max-w-[760px]" onSubmit={send}>
        {failure}
        {sections}
        <footer className="border-t pt-6 sm:flex sm:justify-end">{buttons}</footer>
      </form>
    )
  }
  return (
    <form className="flex-1" onSubmit={send}>
      <div className="mx-auto max-w-[760px] px-4 py-6 md:px-10 md:py-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            {eyebrow && <p className="text-xs text-muted-foreground">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          </div>
          {buttons}
        </header>
        {failure}
        {sections}
      </div>
    </form>
  )
}

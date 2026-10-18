import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError, type ProblemError, type PublicForm } from '@protobase/client'
import { AuthLayout } from '../auth/auth-layout'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { humanize } from '../live/naming'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { Field } from '../record-view'
import { createBody, hasDatabaseDefault, initialDraft, isRequired, type Draft } from '../app/create/create-values'
import { useDocumentTitle } from '../app/document-title'
import { ErrorBanner } from '../app/error-banner'
import { FieldEditor } from '../app/field-editor'
import { fieldErrors, fieldMessage } from '../app/field-errors'
import { Notice } from '../app/meta-gate'
import { useFocusFirstInvalid } from '../app/use-focus-first-invalid'
import { proveHuman } from './prove-human'

/**
 * `/-/forms/<name>`: a public form, for anyone, signed in or not. It sends with a bot check its browser solves, and
 * then shows the form's thanks in its place.
 */
export const PublicFormPage = ({ name }: { name: string }) => {
  const client = useClient()
  const form = useQuery({ queryKey: keys.publicForm(name), queryFn: () => client.form(name) })
  if (form.isPending) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  if (form.error) {
    if (isApiError(form.error) && form.error.status === 404) return <Notice title="Not found">There is no form at this address.</Notice>
    return <Notice title="Cannot reach the API">{isApiError(form.error) ? form.error.message : 'The server did not answer. Is it running?'}</Notice>
  }
  return <LoadedForm form={form.data} />
}

const LoadedForm = ({ form }: { form: PublicForm }) => {
  const client = useClient()
  const { resource: model, view } = form
  const title = form.title ?? view.names?.singular ?? humanize(view.resource)
  useDocumentTitle(title)
  const [draft, setDraft] = useState<Draft>(() => initialDraft(model, [{ title, fields: form.fields }]))
  const [errors, setErrors] = useState<Record<string, ProblemError>>({})
  const [failure, setFailure] = useState<unknown>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  // How many submissions the server turned down for their fields
  const [rejections, setRejections] = useState(0)
  const formRef = useFocusFirstInvalid<HTMLFormElement>(rejections)

  if (sent) {
    return (
      <AuthLayout title={title} size="md">
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success-text">
          {form.thanks}
        </p>
      </AuthLayout>
    )
  }

  const change = (name: string, value: unknown) => {
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== name)))
    setDraft((current) => ({ ...current, [name]: value }))
  }

  const send = async () => {
    setSending(true)
    setFailure(undefined)
    try {
      await client.submitForm(form.name, createBody(model, {}, draft), await proveHuman(client, form.name))
      setSent(true)
    } catch (error) {
      // A field's problem shows under it; anything else, such as too many submissions or a failed check, above the button
      const found = fieldErrors(error)
      setErrors(found)
      if (Object.keys(found).length > 0) setRejections((count) => count + 1)
      else setFailure(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthLayout title={title} size="md">
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {form.fields.map((name) => {
          const field = model.fields[name]!
          const hints = view.fields[name]
          const label = hints?.label ?? humanize(name)
          const problem = errors[name]
          return (
            <Field key={name} name={name} label={label} help={hints?.help} required={isRequired(field)} error={problem && fieldMessage(field, label, problem)}>
              <FieldEditor
                field={field}
                hints={hints}
                value={draft[name] ?? (field.type === 'boolean' ? false : '')}
                stored={undefined}
                placeholder={hasDatabaseDefault(field) ? 'Set by the database' : undefined}
                invalid={Boolean(problem)}
                onChange={(next) => change(name, next)}
              />
            </Field>
          )
        })}
        {failure !== undefined && <ErrorBanner title="Not sent" error={failure} />}
        <Button variant="primary" type="submit" loading={sending} className="min-h-10">
          Send
        </Button>
      </form>
    </AuthLayout>
  )
}

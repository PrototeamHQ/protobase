import { useRef, useState } from 'react'
import type { ProblemError } from '@protobase/client'
import type { SettingsProps } from '@protobase/layout'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../../data/api-provider'
import { differs } from '../../../live/field-values'
import { humanize } from '../../../live/naming'
import { Button } from '../../../primitives/button'
import { Skeleton } from '../../../primitives/skeleton'
import { Field } from '../../../record-view'
import { useToast } from '../../../toasts'
import { createBody, type Draft } from '../../create/create-values'
import { ErrorBanner } from '../../error-banner'
import { fieldErrors, fieldMessage } from '../../field-errors'
import { FieldEditor } from '../../field-editor'
import { useAdminMeta, usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import type { LayoutRecord } from '../record-scope'
import { scopeOf, useFirstRecord, useRefreshResource } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'
import { editBody, startingDraft } from './form-draft'
import { text } from '../messages'

type FormProps = Omit<SettingsProps, 'resource' | 'fields'> & { model: ResourceModel; fields: string[]; stored: LayoutRecord | undefined }

/** A switch or a choice saves as soon as it changes; what is typed waits for Save. */
export const savesAtOnce = (field: FieldModel) => field.type === 'boolean' || field.type === 'enum'

const SettingsForm = ({ model, fields, title, description, stored: loaded }: FormProps) => {
  const { resources, views } = useAdminMeta()
  const permissions = usePermissions(model.name)
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const view = views[model.name]
  const [stored, setStored] = useState(loaded)
  const [draft, setDraft] = useState(() => startingDraft(model, fields, loaded?.record))
  const [errors, setErrors] = useState<Record<string, ProblemError>>({})
  const [failure, setFailure] = useState<unknown>()
  const [saving, setSaving] = useState(false)
  // One save at a time, each from the record the one before wrote, so a quick second change updates rather than creates
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef(loaded)

  const defaults = startingDraft(model, fields, undefined)
  const writable = stored ? can(permissions, 'update') && stored.permissions?.update !== false : can(permissions, 'create')
  const typed = fields.filter((name) => !savesAtOnce(model.fields[name]!))
  const unsaved = typed.some((name) => (stored ? differs(model.fields[name]!, draft[name], stored.record[name]) : draft[name] !== defaults[name]))

  const write = async (changes: Draft) => {
    const current = latest.current
    if (current) {
      const saved = await client.update(model.name, current.key, editBody(model, changes, current.record), current.etag ?? '*')
      return { ...scopeOf(model, saved.record), etag: saved.etag, permissions: saved.permissions ?? current.permissions }
    }
    // The first save creates the record with every value shown, the server making the caller its owner
    const created = await client.create(model.name, createBody(model, resources, { ...defaults, ...changes }))
    return { ...scopeOf(model, created.record), etag: created.etag }
  }

  const save = (changes: Draft) => {
    const run = queue.current.then(async () => {
      setSaving(true)
      setFailure(undefined)
      await write(changes).then(
        async (record) => {
          latest.current = record
          setStored(record)
          setErrors((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !Object.hasOwn(changes, name))))
          await refresh(model.name)
          toast.show({ state: 'success', title: text('saved', title ?? text('settings')) })
        },
        (error: unknown) => {
          setErrors((current) => ({ ...current, ...fieldErrors(error) }))
          setFailure(error)
        },
      )
      setSaving(false)
    })
    queue.current = run
  }

  const change = (name: string, next: unknown) => {
    setDraft((current) => ({ ...current, [name]: next }))
    if (savesAtOnce(model.fields[name]!)) save({ [name]: next })
  }

  return (
    <CardFrame title={title} description={description} className="h-full">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (unsaved) save(Object.fromEntries(typed.map((name) => [name, draft[name]])))
        }}
      >
        {failure !== undefined && Object.keys(errors).length === 0 && <ErrorBanner title={text('notSaved')} error={failure} />}
        {fields.map((name) => {
          const field = model.fields[name]!
          const label = view?.fields[name]?.label ?? humanize(name)
          const problem = errors[name]
          return (
            <Field key={name} name={name} label={label} help={view?.fields[name]?.help} error={problem && fieldMessage(field, label, problem)}>
              <FieldEditor
                field={field}
                hints={view?.fields[name]}
                value={draft[name]}
                stored={stored?.record[name] ?? defaults[name]}
                invalid={Boolean(problem)}
                locked={!writable || field.readOnly}
                resource={model.name}
                onChange={(next) => change(name, next)}
              />
            </Field>
          )
        })}
        {writable && unsaved && (
          <div>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {text('save')}
            </Button>
          </div>
        )}
      </form>
    </CardFrame>
  )
}

const LoadedSettings = (props: FormProps) => {
  const record = useFirstRecord(props.model, {})
  if (record.isPending) {
    return (
      <CardFrame title={props.title} description={props.description}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </CardFrame>
    )
  }
  if (record.error) {
    return (
      <CardFrame title={props.title} description={props.description}>
        <ErrorBanner title={text('couldNotLoad')} error={record.error} />
      </CardFrame>
    )
  }
  return <SettingsForm {...props} stored={record.data ?? undefined} />
}

/**
 * The signed-in person's own record of a resource as settings: each field as a control, a switch or a choice saving as
 * it changes and typed values with Save, the defaults shown until the first save creates the record. The server keeps
 * every caller to their own record, so the list holds at most theirs.
 */
export const SettingsBlock = ({ node }: BlockProps) => {
  const { resource, fields = [], ...rest } = propsOf<SettingsProps>(node)
  const model = useAdminMeta().resources[resource]
  if (!model) return null
  return <LoadedSettings {...rest} model={model} fields={fields.filter((name) => Object.hasOwn(model.fields, name))} stored={undefined} />
}

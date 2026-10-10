import { useState, type ReactNode } from 'react'
import { isApiError } from '@protobase/client'
import type { ModalFormProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../../data/api-provider'
import { differs, toDraft, toPatchValue } from '../../../live/field-values'
import { humanize } from '../../../live/naming'
import { Button } from '../../../primitives/button'
import { Dialog } from '../../../primitives/dialog'
import { Field } from '../../../record-view'
import { useToast } from '../../../toasts'
import { createBody, isChosen, type Draft } from '../../create/create-values'
import { ErrorBanner } from '../../error-banner'
import { FieldEditor } from '../../field-editor'
import { useAdminMeta, usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { useLayoutRecord, type LayoutRecord } from '../record-scope'
import { useFirstRecord, useRefreshResource } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'

type FormProps = Omit<ModalFormProps, 'resource' | 'recordKey'> & { model: ResourceModel; record: LayoutRecord | undefined; onClose: () => void }

/** The literal defaults of new records, or the record's values when editing; relations as `{ key, label }` once chosen. */
const startingDraft = (model: ResourceModel, fields: string[], record: LayoutRecord | undefined): Draft =>
  Object.fromEntries(
    fields.map((name) => {
      const field = model.fields[name]!
      if (field.type === 'file') return [name, record?.record[name] ?? null]
      if (record) return [name, field.type === 'boolean' ? Boolean(record.record[name]) : toDraft(record.record[name])]
      const fallback = field.default && 'value' in field.default ? field.default.value : undefined
      return [name, field.type === 'boolean' ? Boolean(fallback) : toDraft(fallback)]
    }),
  )

/** Changed fields only; a chosen relation sends its key. */
const editBody = (model: ResourceModel, draft: Draft, record: LayoutRecord) =>
  Object.fromEntries(
    Object.entries(draft).flatMap(([name, value]) => {
      const field = model.fields[name]!
      if (isChosen(value)) return value.key === toDraft(record.record[name]) ? [] : [[name, field.type === 'integer' ? Number(value.key) : value.key]]
      return differs(field, value, record.record[name]) ? [[name, toPatchValue(field, value)]] : []
    }),
  )

const ModalFormDialog = ({ model, record, mode, label, title, fields, values, onClose }: FormProps) => {
  const { resources, views } = useAdminMeta()
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const view = views[model.name]
  const [draft, setDraft] = useState(() => startingDraft(model, fields, record))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<unknown>()
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    setFailure(undefined)
    const saved =
      mode === 'create'
        ? client.create(model.name, { ...createBody(model, resources, draft), ...values })
        : client.update(model.name, record!.key, editBody(model, draft, record!), record!.etag ?? '*')
    await saved.then(
      async () => {
        await refresh(model.name)
        toast.show({ state: 'success', title: `${title ?? label}: saved` })
        onClose()
      },
      (error: unknown) => {
        if (isApiError(error)) setErrors(Object.fromEntries(error.errors.flatMap((entry) => (entry.field ? [[entry.field, entry.message]] : []))))
        setFailure(error)
      },
    )
    setSaving(false)
  }

  return (
    <Dialog
      title={title ?? label}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {failure !== undefined && Object.keys(errors).length === 0 && <ErrorBanner title="Not saved" error={failure} />}
        {fields.map((name) => {
          const field = model.fields[name]!
          const value = draft[name]
          const target = field.relation ? resources[field.relation.resource] : undefined
          return (
            <Field key={name} label={view?.fields[name]?.label ?? humanize(name)} help={view?.fields[name]?.help} error={errors[name]}>
              <FieldEditor
                field={field}
                hints={view?.fields[name]}
                value={isChosen(value) ? value.key : value}
                stored={record?.record[name]}
                relationLabel={isChosen(value) ? value.label : undefined}
                relationPicker={target ? { target, view: views[target.name] } : undefined}
                invalid={Boolean(errors[name])}
                resource={model.name}
                onChange={(next) => {
                  setErrors(({ [name]: _, ...rest }) => rest)
                  setDraft((current) => ({ ...current, [name]: next }))
                }}
              />
            </Field>
          )
        })}
      </form>
    </Dialog>
  )
}

const KeyedRecord = ({ model, recordKey, children }: { model: ResourceModel; recordKey: string; children: (record: LayoutRecord | undefined) => ReactNode }) => {
  const record = useFirstRecord(model, { key: recordKey })
  return <>{children(record.data ?? undefined)}</>
}

/** A button that opens a form in a dialog: a new record of `resource`, or the record around it (or `recordKey`) to edit. */
export const ModalFormBlock = ({ node }: BlockProps) => {
  const props = propsOf<ModalFormProps>(node)
  const scope = useLayoutRecord()
  const { resources } = useAdminMeta()
  const model = resources[props.resource ?? scope?.model.name ?? '']
  const permissions = usePermissions(model?.name ?? '')
  const [open, setOpen] = useState(false)
  if (!model) return null
  const allowed = props.mode === 'create' ? can(permissions, 'create') : can(permissions, 'update') && scope?.permissions?.update !== false
  if (!allowed) return null
  const button = (record: LayoutRecord | undefined) => (
    <>
      <Button size="sm" variant={props.variant ?? 'secondary'} disabled={props.mode === 'edit' && !record} onClick={() => setOpen(true)}>
        {props.label}
      </Button>
      {open && <ModalFormDialog {...props} model={model} record={props.mode === 'edit' ? record : undefined} onClose={() => setOpen(false)} />}
    </>
  )
  if (props.mode === 'edit' && props.recordKey !== undefined) return <KeyedRecord model={model} recordKey={props.recordKey}>{button}</KeyedRecord>
  return button(props.mode === 'edit' ? scope : undefined)
}

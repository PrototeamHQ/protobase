import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { encodeKey } from '@protobase/schema'
import { isApiError } from '@protobase/client'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { recordKey } from '../../live/model-helpers'
import { FieldEditor } from '../field-editor'
import { Notice, useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useRouter } from '../router'
import { useLiveSave } from '../use-live-save'
import { CreateRecordForm } from './create-record-form'
import { createBody, createSections, hasDatabaseDefault, initialDraft, isChosen, isRequired, type Draft } from './create-values'

const without = <V,>(source: Record<string, V>, name: string): Record<string, V> => Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))

/** `/:resource/new`: a form from the view's layout; on success it opens the new record. */
export const CreatePage = ({ resource }: { resource: string }) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]
  const permissions = usePermissions(resource)
  if (!model) return <Notice title="Not found">There is no resource called {resource}.</Notice>
  if (!can(permissions, 'create')) return <Notice title="Not allowed">You cannot create {meta.views[resource]?.names?.plural.toLowerCase() ?? resource}.</Notice>
  return <LoadedCreate resource={resource} />
}

const LoadedCreate = ({ resource }: { resource: string }) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]!
  const view = meta.views[resource]
  const client = useClient()
  const queryClient = useQueryClient()
  const { navigate } = useRouter()
  const noun = view?.names?.singular ?? humanize(resource)
  const feedback = useLiveSave(view?.saveFeedback ?? 'toast', `New ${noun.toLowerCase()}`)
  const sections = createSections(model, view)
  const [draft, setDraft] = useState<Draft>(() => initialDraft(model, sections))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const change = (name: string, value: unknown) => {
    setErrors((current) => without(current, name))
    setDraft((current) => ({ ...current, [name]: value }))
  }

  const submit = () =>
    feedback.run(async () => {
      let created
      try {
        created = await client.create(resource, createBody(model, meta.resources, draft))
      } catch (error) {
        if (isApiError(error)) setErrors(Object.fromEntries(error.errors.flatMap((entry) => (entry.field ? [[entry.field, entry.message]] : []))))
        throw error
      }
      for (const prefix of ['page', 'list', 'first-page', 'facets', 'series']) void queryClient.invalidateQueries({ queryKey: [prefix, resource] })
      navigate(`/${resource}/${encodeKey(recordKey(model, created.record))}`, { replace: true })
    })

  const formSections = sections.map((section) => ({
    title: section.title,
    help: section.help,
    fields: section.fields.map((name) => {
      const field = model.fields[name]!
      const value = draft[name]
      const target = field.relation ? meta.resources[field.relation.resource] : undefined
      return {
        name,
        label: view?.fields[name]?.label ?? humanize(name),
        help: view?.fields[name]?.help,
        required: isRequired(field),
        error: errors[name],
        editor: (
          <FieldEditor
            field={field}
            hints={view?.fields[name]}
            value={isChosen(value) ? value.key : (value ?? (field.type === 'boolean' ? false : ''))}
            stored={undefined}
            relationLabel={isChosen(value) ? value.label : undefined}
            placeholder={hasDatabaseDefault(field) ? 'Set by the database' : undefined}
            relationPicker={target ? { target, view: meta.views[target.name] } : undefined}
            invalid={Boolean(errors[name])}
            resource={model.name}
            onChange={(next) => change(name, next)}
          />
        ),
      }
    }),
  }))

  return (
    <CreateRecordForm
      noun={noun}
      collection={view?.names?.plural ?? humanize(resource)}
      sections={formSections}
      saving={feedback.phase === 'saving'}
      message={feedback.message}
      onSubmit={() => void submit()}
      onCancel={() => navigate(`/${resource}`)}
    />
  )
}

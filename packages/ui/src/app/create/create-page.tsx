import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { isApiError } from '@protobase/client'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { recordKey } from '../../live/model-helpers'
import { fetchLabels } from '../../live/relation-labels'
import { FieldEditor } from '../field-editor'
import { Notice, useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useAppAddress } from '../use-app-address'
import { useLiveSave } from '../use-live-save'
import { CreateRecordForm } from './create-record-form'
import { createBody, createSections, hasDatabaseDefault, initialDraft, isChosen, isRequired, type Draft } from './create-values'

const without = <V,>(source: Record<string, V>, name: string): Record<string, V> => Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))

type CreatePageProps = { resource: string; values?: Readonly<Record<string, string>> }

/** `/:resource/new`: a form from the view's layout, filled in with the address's `values`; on success it opens the new record. */
export const CreatePage = ({ resource, values }: CreatePageProps) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]
  const permissions = usePermissions(resource)
  if (!model) return <Notice title="Not found">There is no resource called {resource}.</Notice>
  if (!can(permissions, 'create')) return <Notice title="Not allowed">You cannot create {meta.views[resource]?.names?.plural.toLowerCase() ?? resource}.</Notice>
  return <LoadedCreate resource={resource} values={values} />
}

const LoadedCreate = ({ resource, values }: CreatePageProps) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]!
  const view = meta.views[resource]
  const client = useClient()
  const queryClient = useQueryClient()
  const { go } = useAppAddress()
  const noun = view?.names?.singular ?? humanize(resource)
  const feedback = useLiveSave(view?.saveFeedback ?? 'toast', `New ${noun.toLowerCase()}`)
  const sections = createSections(model, view)
  const [draft, setDraft] = useState<Draft>(() => initialDraft(model, sections, values))
  const [errors, setErrors] = useState<Record<string, string>>({})

  // A relation the address fills in shows the name of the record it points at once that has loaded.
  useEffect(() => {
    for (const [name, key] of Object.entries(values ?? {})) {
      const target = meta.resources[model.fields[name]?.relation?.resource ?? '']
      if (!target) continue
      void fetchLabels(queryClient, client, target, [key], meta.views[target.name]).then((labels) => {
        const label = labels.get(key)
        if (label) setDraft((current) => (isChosen(current[name]) && current[name].key === key ? { ...current, [name]: { key, label } } : current))
      })
    }
  }, [values, meta, model, client, queryClient])

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
      go({ kind: 'record', resource, key: recordKey(model, created.record) }, { replace: true })
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
      onCancel={() => go({ kind: 'list', resource })}
    />
  )
}

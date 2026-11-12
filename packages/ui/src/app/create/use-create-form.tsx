import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { isApiError, type ProblemError } from '@protobase/client'
import type { AppAddress } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { recordKey } from '../../live/model-helpers'
import { fetchLabels } from '../../live/relation-labels'
import { FieldEditor } from '../field-editor'
import { fieldErrors, fieldMessage } from '../field-errors'
import { isWideField } from '../field-types/shown-widget'
import { useAdminMeta } from '../meta-gate'
import { useProjectUi } from '../pages/project-ui'
import { useFocusFirstInvalid } from '../use-focus-first-invalid'
import { nothingSaved, useLiveSave, type SaveMode } from '../use-live-save'
import { createBody, createSections, hasDatabaseDefault, initialDraft, isChosen, isRequired, numberDefault, type Draft } from './create-values'
import { text } from './messages'

const without = <V,>(source: Record<string, V>, name: string): Record<string, V> => Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))

export type CreateFormOptions = {
  resource: string
  /** What the form starts with, by field, as a create address gives it. */
  values?: Readonly<Record<string, string>> | undefined
  /** Gets the new record, and its address. A create of a record that exists under a unique key opens that one instead. */
  onCreated: (record: Record<string, unknown> | undefined, opens: AppAddress) => void
  /** Where it says it saved: a toast, or the view's own way by default. */
  feedback?: SaveMode
}

/**
 * The state of a form that creates a record, from the view's layout: for the create page and for a form in place, such
 * as in a focus page's panel. `sections` draw its fields, `set` gives one a value from outside, and `submit` sends what
 * is filled in, with `extra` on top, resolving to whether it did; while one is under way another sends nothing.
 */
export const useCreateForm = ({ resource, values, onCreated, feedback: mode }: CreateFormOptions) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]!
  const view = meta.views[resource]
  const client = useClient()
  const queryClient = useQueryClient()
  const { fields: fieldTypes } = useProjectUi()
  const noun = view?.names?.singular ?? humanize(resource)
  const feedback = useLiveSave(mode ?? view?.saveFeedback ?? 'toast', text('subject', { noun }))
  const shape = createSections(model, view)
  const [draft, setDraft] = useState<Draft>(() => initialDraft(model, shape, values))
  const [errors, setErrors] = useState<Record<string, ProblemError>>({})
  // How many creates the server turned down for their fields
  const [rejections, setRejections] = useState(0)
  const ref = useFocusFirstInvalid<HTMLFormElement>(rejections)
  const [touched, setTouched] = useState(false)
  // A create under way, whatever the feedback shows: a second press sends nothing, so it never makes two records
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)

  // A relation the address fills in shows the name of the record it points at once that has loaded.
  useEffect(() => {
    for (const [name, key] of Object.entries(values ?? {})) {
      const target = meta.resources[model.fields[name]?.relation?.resource ?? '']
      if (!target) continue
      void fetchLabels(queryClient, client, target, [key], meta.views[target.name]).then((labels) => {
        const label = labels.get(key)
        if (label) setDraft((current) => (isChosen(current[name]) && current[name].key === key && current[name].label !== label ? { ...current, [name]: { key, label } } : current))
      })
    }
  }, [values, meta, model, client, queryClient])

  const set = (name: string, value: unknown) => {
    setErrors((current) => without(current, name))
    setTouched(true)
    setDraft((current) => ({ ...current, [name]: value }))
  }

  const submit = async (extra: Record<string, unknown> = {}) => {
    if (sending.current) return false
    sending.current = true
    setBusy(true)
    try {
      return await send(extra)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const send = (extra: Record<string, unknown>) =>
    feedback.run(async () => {
      let created
      try {
        created = await client.create(resource, { ...createBody(model, meta.resources, draft), ...extra })
      } catch (error) {
        // The record it repeats, under a unique key the resource opens instead (`.openExisting()`), opens as a new one would
        const existing = isApiError(error) ? error.existing : undefined
        if (existing) {
          onCreated(undefined, { kind: 'record', resource, key: existing.key })
          return nothingSaved
        }
        const found = fieldErrors(error)
        setErrors(found)
        if (Object.keys(found).length > 0) setRejections((count) => count + 1)
        throw error
      }
      for (const prefix of ['page', 'list', 'first-page', 'map', 'facets', 'series', 'aggregate', 'count']) void queryClient.invalidateQueries({ queryKey: [prefix, resource] })
      onCreated(created.record, { kind: 'record', resource, key: recordKey(model, created.record) })
    })

  const sections = shape.map((section) => ({
    title: section.title,
    help: section.help,
    fields: section.fields.map((name) => {
      const field = model.fields[name]!
      const value = draft[name]
      const target = field.relation ? meta.resources[field.relation.resource] : undefined
      const label = view?.fields[name]?.label ?? humanize(name)
      const problem = errors[name]
      return {
        name,
        label,
        help: view?.fields[name]?.help,
        required: isRequired(field),
        error: problem && fieldMessage(field, label, problem),
        wide: isWideField(fieldTypes, field, view?.fields[name]),
        editor: (
          <FieldEditor
            field={field}
            hints={view?.fields[name]}
            value={isChosen(value) ? value.key : (value ?? (field.type === 'boolean' ? false : ''))}
            stored={undefined}
            relationLabel={isChosen(value) ? value.label : undefined}
            placeholder={hasDatabaseDefault(field) ? text('setByDatabase') : numberDefault(field)}
            relationPicker={target ? { target, view: meta.views[target.name] } : undefined}
            invalid={Boolean(errors[name])}
            resource={model.name}
            onChange={(next) => set(name, next)}
          />
        ),
      }
    }),
  }))

  return { ref, sections, set, submit, touched, saving: busy, message: feedback.message }
}

export type CreateForm = ReturnType<typeof useCreateForm>

import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { isEditable, toPatchValue } from '../../live/field-values'

export type CreateSection = { title: string; help?: string; fields: string[] }

/** A value held by the form: text or a boolean, or a chosen record for relations. */
export type Draft = Record<string, unknown>

export type Chosen = { key: string; label: string }

export const isChosen = (value: unknown): value is Chosen => typeof value === 'object' && value !== null && 'key' in value

/** Fields the user can set on a new record: not read-only, not the tenant, and not structured data. */
export const isCreatable = (model: ResourceModel, field: FieldModel) =>
  field.name !== model.tenant && !field.readOnly && (field.type === 'relation' || isEditable(field))

/** The view's sections limited to creatable fields, plus a section for any creatable field the layout leaves out. */
export const createSections = (model: ResourceModel, view: ViewModel | undefined): CreateSection[] => {
  const creatable = Object.values(model.fields).filter((field) => isCreatable(model, field)).map((field) => field.name)
  const placed = new Set<string>()
  const sections = (view?.layout ?? []).flatMap((item) => {
    if (item.kind !== 'section') return []
    const fields = item.fields.filter((name) => creatable.includes(name) && !placed.has(name))
    fields.forEach((name) => placed.add(name))
    return fields.length > 0 ? [{ title: item.title, help: item.help, fields }] : []
  })
  const rest = creatable.filter((name) => !placed.has(name))
  if (rest.length === 0) return sections
  return [...sections, { title: sections.length === 0 ? 'Details' : 'Other fields', fields: rest }]
}

const keyValue = (target: ResourceModel | undefined, key: string) => {
  const type = target?.primaryKey.length === 1 ? target.fields[target.primaryKey[0]!]?.type : undefined
  return type === 'integer' ? Number(key) : key
}

/**
 * The JSON body for `POST`: only what the user filled in, so the database applies defaults to the rest
 * and the server reports what is still required.
 */
export const createBody = (model: ResourceModel, resources: Record<string, ResourceModel>, draft: Draft) =>
  Object.fromEntries(
    Object.entries(draft).flatMap(([name, value]) => {
      const field = model.fields[name]
      if (!field) return []
      if (isChosen(value)) return [[name, keyValue(resources[field.relation?.resource ?? ''], value.key)]]
      if (field.type === 'boolean') return [[name, Boolean(value)]]
      if (field.type === 'file') return value ? [[name, toPatchValue(field, value)]] : []
      if (String(value).trim() === '') return []
      return [[name, toPatchValue(field, value)]]
    }),
  )

/** A field is required when it can be neither empty nor filled in by a default. */
export const isRequired = (field: FieldModel) => !field.nullable && !field.default && field.type !== 'boolean'

/** The form's starting values: literal defaults from `/meta`. Database defaults stay empty so the database fills them. */
export const initialDraft = (model: ResourceModel, sections: CreateSection[]): Draft =>
  Object.fromEntries(
    sections.flatMap((section) =>
      section.fields.flatMap((name) => {
        const fallback = model.fields[name]?.default
        if (!fallback || !('value' in fallback) || fallback.value === null || fallback.value === undefined) return []
        return [[name, typeof fallback.value === 'boolean' ? fallback.value : String(fallback.value)]]
      }),
    ),
  )

export const hasDatabaseDefault = (field: FieldModel) => Boolean(field.default && 'db' in field.default)

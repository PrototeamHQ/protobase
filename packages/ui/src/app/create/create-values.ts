import { isRecordCondition, type FieldModel, type FieldViewModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'
import { isEditable, toDraft, toPatchValue } from '../../live/field-values'
import { whenShown } from '../record-mode/record-mode'
import { text } from './messages'

export type CreateSection = { title: string; help?: string; fields: string[] }

/** A value held by the form: text or a boolean, or a chosen record for relations. */
export type Draft = Record<string, unknown>

export type Chosen = { key: string; label: string }

export const isChosen = (value: unknown): value is Chosen => typeof value === 'object' && value !== null && 'key' in value

/** Fields the user can set on a new record: not read-only, not the tenant, and no JSON but through a field type (`isEditable`). */
export const isCreatable = (model: ResourceModel, field: FieldModel, hints?: FieldViewModel) =>
  field.name !== model.tenant && !field.readOnly && (field.type === 'relation' || isEditable(field, hints))

/**
 * The view's sections limited to creatable fields, plus a section for any creatable field the layout leaves out. The
 * create form is a form, so sections and fields meant only for reading the record stay out of their sections, and a
 * creatable field among them lands in that last section. A write-only field is on the form only where a section names it.
 */
export const createSections = (model: ResourceModel, view: ViewModel | undefined): CreateSection[] => {
  const creatable = Object.values(model.fields).filter((field) => isCreatable(model, field, view?.fields[field.name])).map((field) => field.name)
  const placed = new Set<string>()
  const sections = layoutItems(view?.layout ?? []).flatMap((item) => {
    if (item.kind !== 'section' || isRecordCondition(item.when) || !whenShown(item.when, true)) return []
    const fields = item.fields.filter((name) => creatable.includes(name) && !placed.has(name) && whenShown(view?.fields[name]?.when, true))
    fields.forEach((name) => placed.add(name))
    return fields.length > 0 ? [{ title: item.title, help: item.help, fields }] : []
  })
  const rest = creatable.filter((name) => !placed.has(name) && !model.fields[name]!.writeOnly)
  if (rest.length === 0) return sections
  return [...sections, { title: sections.length === 0 ? text('details') : text('otherFields'), fields: rest }]
}

/** A chosen record's key as the API takes it: a number when the target's key is an integer. */
export const keyValue = (target: ResourceModel | undefined, key: string) => {
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

// A value the address gives as text, as the form holds it: a relation as a chosen record named by its key until its
// name has loaded, a boolean as one.
const givenValue = (field: FieldModel, value: string): unknown => {
  if (field.type === 'relation') return { key: value, label: value } satisfies Chosen
  if (field.type === 'boolean') return value === 'true'
  return value
}

const numeric = new Set(['integer', 'bigint', 'decimal'])

/**
 * A number field's literal default, which its empty input shows as a placeholder rather than as its value: typing into a
 * prefilled `0` would add to it, and the create applies the default to an empty field.
 */
export const numberDefault = (field: FieldModel) => {
  if (!numeric.has(field.type) || !field.default || !('value' in field.default)) return undefined
  const value = field.default.value
  return value === null || value === undefined ? undefined : String(value)
}

/**
 * The form's starting values: the values the address gives (`/notes/new?listing_id=42`), for the fields the form has,
 * else literal defaults from `/meta`, but for numbers. Database defaults stay empty so the database fills them.
 */
export const initialDraft = (model: ResourceModel, sections: CreateSection[], given: Readonly<Record<string, string>> = {}): Draft =>
  Object.fromEntries(
    sections.flatMap((section) =>
      section.fields.flatMap((name) => {
        const field = model.fields[name]!
        if (Object.hasOwn(given, name)) return [[name, givenValue(field, given[name]!)]]
        const fallback = field.default
        if (numberDefault(field) !== undefined) return []
        if (!fallback || !('value' in fallback) || fallback.value === null || fallback.value === undefined) return []
        return [[name, typeof fallback.value === 'boolean' ? fallback.value : toDraft(fallback.value)]]
      }),
    ),
  )

export const hasDatabaseDefault = (field: FieldModel) => Boolean(field.default && 'db' in field.default)

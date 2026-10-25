import type { ResourceModel } from '@protobase/schema'
import { differs, toDraft, toPatchValue } from '../../../live/field-values'
import { isChosen, type Draft } from '../../create/create-values'

type Row = Record<string, unknown>

/** The literal defaults of new records, or the stored record's values; relations as `{ key, label }` once chosen. */
export const startingDraft = (model: ResourceModel, fields: string[], stored: Row | undefined): Draft =>
  Object.fromEntries(
    fields.map((name) => {
      const field = model.fields[name]!
      if (field.type === 'file') return [name, stored?.[name] ?? null]
      if (stored) return [name, field.type === 'boolean' ? Boolean(stored[name]) : toDraft(stored[name])]
      const fallback = field.default && 'value' in field.default ? field.default.value : undefined
      return [name, field.type === 'boolean' ? Boolean(fallback) : toDraft(fallback)]
    }),
  )

/** Changed fields only; a chosen relation sends its key. */
export const editBody = (model: ResourceModel, draft: Draft, stored: Row) =>
  Object.fromEntries(
    Object.entries(draft).flatMap(([name, value]) => {
      const field = model.fields[name]!
      if (isChosen(value)) return value.key === toDraft(stored[name]) ? [] : [[name, field.type === 'integer' ? Number(value.key) : value.key]]
      return differs(field, value, stored[name]) ? [[name, toPatchValue(field, value)]] : []
    }),
  )

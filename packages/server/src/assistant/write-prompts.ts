import { enumLabel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { humanize, recordTitle } from '@protobase/schema/internal'
import type { Row } from '../types'
import type { ApprovalRequest } from './approval'
import type { RecordKeyInput } from './records'
import type { ReadableResources } from './tools'
import type { writeText } from './write-messages'

/**
 * The approvals the write tools ask for, naming the record as the breadcrumb does and its fields by their labels, in
 * the texts of the user's language. A resource or field the caller may not read is named by its name in words.
 */
export type WriteTexts = ReturnType<typeof writeText>

export type Described = { name: string; model?: ResourceModel; view?: ViewModel }

export const describedResource = (readable: ReadableResources, name: string): Described => ({
  name,
  model: readable.models.find((model) => model.name === name),
  view: readable.views.find((view) => view.resource === name),
})

// Control, format (bidi and zero-width) and line separator characters, which could hide or reorder text in the prompt
const hiddenCharacters = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

// Long text, such as a description, would bury the other fields
const longest = 200

/** `text` on one line with nothing hidden in it, cut at 200 characters. */
const shown = (text: string) => {
  const line = text.replace(hiddenCharacters, ' ')
  return line.length > longest ? `${line.slice(0, longest - 1)}…` : line
}

const resourceLabel = ({ name, view }: Described) => shown(view?.names?.singular ?? humanize(name))

const fieldLabel = ({ view }: Described, name: string) => shown(view?.fields[name]?.label ?? humanize(name))

const shownValue = (text: WriteTexts, described: Described, name: string, value: unknown) => {
  const field = described.model?.fields[name]
  if (field?.sensitive) return text.hidden
  if (value === null || value === undefined) return text.empty
  if (typeof value === 'boolean') return value ? text.yes : text.no
  if (field?.type === 'enum' && typeof value === 'string') return shown(enumLabel(value, described.view?.fields[name]?.valueLabels))
  if (typeof value === 'string') return shown(value)
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return shown(JSON.stringify(value))
}

/** `Task #42 "Fix the sign-in lockout"`: the resource's label, the record's key, and its title when it has one apart from the key. */
const recordName = (described: Described, key: RecordKeyInput, record: Row) => {
  const shownKey = shown(Array.isArray(key) ? key.join(',') : String(key))
  const title = described.model ? shown(recordTitle(described.model, described.view, record, shownKey)) : shownKey
  return `${resourceLabel(described)} #${shownKey}${title === shownKey ? '' : ` "${title}"`}`
}

const titleOfNew = (described: Described, data: Row) => {
  if (!described.model) return undefined
  const title = shown(recordTitle(described.model, described.view, data, ''))
  return title === '' ? undefined : title
}

// The same value whatever the order of an object's keys is not worth telling apart here: JSON is close enough
const same = (before: unknown, after: unknown) => JSON.stringify(before ?? null) === JSON.stringify(after ?? null)

/** `Create Task "Fix the sign-in lockout"?`, with each field the new record is given by its label. */
export const createApproval = (text: WriteTexts, described: Described, data: Row): ApprovalRequest => ({
  title: text.createTitle(resourceLabel(described), titleOfNew(described, data)),
  fields: Object.entries(data).map(([name, value]) => ({ label: fieldLabel(described, name), value: shownValue(text, described, name, value) })),
  approveLabel: text.create,
  rejectLabel: text.reject,
})

/**
 * `Update Task #42 "Fix the sign-in lockout"?`, with each field that changes as `In flight -> Done`. A field the
 * caller cannot read before, such as a sensitive one, shows its new value alone.
 */
export const updateApproval = (text: WriteTexts, described: Described, key: RecordKeyInput, current: Row, data: Row): ApprovalRequest => {
  const changed = Object.entries(data).filter(([name, value]) => !Object.hasOwn(current, name) || !same(current[name], value))
  const fields = changed.map(([name, value]) => {
    const after = shownValue(text, described, name, value)
    const before = Object.hasOwn(current, name) ? `${shownValue(text, described, name, current[name])} -> ` : ''
    return { label: fieldLabel(described, name), value: `${before}${after}` }
  })
  return {
    title: text.updateTitle(recordName(described, key, current)),
    ...(fields.length > 0 ? { fields } : { body: text.noChanges }),
    approveLabel: text.update,
    rejectLabel: text.reject,
  }
}

/** `Delete Task #42 "Fix the sign-in lockout"?`, saying whether it can be restored (a soft delete) or is gone for good. */
export const deleteApproval = (text: WriteTexts, described: Described, key: RecordKeyInput, current: Row, restorable: boolean): ApprovalRequest => ({
  title: text.deleteTitle(recordName(described, key, current)),
  body: restorable ? text.restorable : text.permanent,
  tone: restorable ? 'warning' : 'danger',
  approveLabel: restorable ? text.delete : text.deleteForGood,
  rejectLabel: text.reject,
})

// A comment keeps its lines, but nothing that could hide or reorder text
const hiddenInComment = /[\p{Cf}\p{Zl}\p{Zp}]|[^\P{Cc}\n]/gu

/** `Comment on Task #42 "Fix the sign-in lockout"?`, with the whole comment, as it will be posted. */
export const commentApproval = (text: WriteTexts, described: Described, key: RecordKeyInput, current: Row, comment: string): ApprovalRequest => ({
  title: text.commentTitle(recordName(described, key, current)),
  body: comment.trim().replace(hiddenInComment, ' '),
  approveLabel: text.comment,
  rejectLabel: text.reject,
})

import { shownInputs } from '@protobase/schema/internal'
import type { ActionInputModel, FieldModel, FieldType, FieldViewModel } from '@protobase/schema'
import { toDraft, toPatchValue } from '../../../live/field-values'
import { isChosen, type Draft } from '../../create/create-values'
import { text } from '../messages'

const fieldTypes: Record<Exclude<ActionInputModel['kind'], 'choice' | 'custom'>, FieldType> = { text: 'text', integer: 'integer', decimal: 'decimal', boolean: 'boolean', date: 'date' }

/** The field an input is edited as, so the create form's editors edit it: a choice of options is an enum, of records a relation. */
export const inputField = (input: ActionInputModel): FieldModel => {
  const base = { name: input.name, column: input.name, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] }
  if (input.kind === 'custom') return { ...base, type: 'json' }
  if (input.kind !== 'choice') return { ...base, type: fieldTypes[input.kind] }
  if (input.resource !== undefined) return { ...base, type: 'relation', relation: { resource: input.resource, columns: [input.name] } }
  return { ...base, type: 'enum', enumValues: (input.options ?? []).map((option) => option.value) }
}

/** The view hints an input's editor reads: its label, a box that grows for a multiline text, a choice's labels. */
export const inputHints = (input: ActionInputModel): FieldViewModel => ({
  label: input.label,
  ...(input.multiline && { multiline: true }),
  ...(input.options && { valueLabels: Object.fromEntries(input.options.map((option) => [option.value, option.label])) }),
})

/** What each input holds when the dialog opens: its default, as its editor holds it. */
export const startingAnswers = (inputs: ActionInputModel[]): Draft =>
  Object.fromEntries(
    inputs.map((input) => {
      if (input.kind === 'custom') return [input.name, input.default ?? null]
      if (input.kind === 'boolean') return [input.name, Boolean(input.default)]
      return [input.name, toDraft(input.default)]
    }),
  )

// An answer as the handler gets it: null when empty, a number for an integer, a chosen record's key.
const answerOf = (input: ActionInputModel, held: unknown) => {
  if (input.kind === 'custom') return held ?? null
  if (isChosen(held)) return held.key
  // A record's key given as the default, before anything is picked.
  if (input.resource !== undefined) return String(held ?? '') === '' ? null : String(held)
  return toPatchValue(inputField(input), held)
}

/** The answers of the inputs that show, as the handler gets them in `values`, and the names of those that show. */
export const answeredValues = (inputs: ActionInputModel[], draft: Draft) => {
  const all = Object.fromEntries(inputs.map((input) => [input.name, answerOf(input, draft[input.name])]))
  const shown = shownInputs(inputs, all)
  return { shown, values: Object.fromEntries(Object.entries(all).filter(([name]) => shown.has(name))) }
}

const decimal = /^-?\d+(\.\d+)?$/
const date = /^\d{4}-\d{2}-\d{2}$/

// Why an answer is refused before the action runs, if it is.
const refusal = (input: ActionInputModel, value: unknown) => {
  if (value === null || value === '') return input.required ? text('required') : undefined
  if (input.kind === 'integer' && !Number.isInteger(value)) return text('wholeNumber')
  if (input.kind === 'decimal' && !decimal.test(String(value))) return text('number')
  if (input.kind === 'date' && !date.test(String(value))) return text('dateFormat')
  if (input.max !== undefined && String(value).length > input.max) return text('atMost', { max: input.max })
  return undefined
}

/** What is wrong with the answers that show, by input name: one left empty that is required, a number that is none, a text too long. */
export const refusedAnswers = (inputs: ActionInputModel[], values: Record<string, unknown>) =>
  Object.fromEntries(
    inputs.flatMap((input) => {
      if (!Object.hasOwn(values, input.name)) return []
      const reason = refusal(input, values[input.name])
      return reason ? [[input.name, reason]] : []
    }),
  )

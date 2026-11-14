import { enumLabel } from '@protobase/schema'
import { parseTemplatePath } from '@protobase/schema/internal'
import { booleanFieldText, dateFieldText, isEmptyFieldValue, numberFieldText, safeFieldUrl, textFieldText } from '../field-format'
import type { BooleanFieldProps, DateFieldProps, InlineFieldProps, NumberFieldProps, UrlFieldProps } from '../inline-fields'
import { escapeMarkdown, link } from './markdown'
import { recordValue } from './record-value'
import { relativeTimeText } from './relative-time'
import type { TextContext, TextForm, TextOptions } from './text-form'

// Text forms of the field components: the value as the web formats it, `emptyText` when it has none, and nothing
// when the text has no record to read it from.

// The value `source` names in the record around the tree, the only one the text has
const sourceValue = (source: string, options: TextOptions) => {
  const path = parseTemplatePath(source)
  if (!options.record || !path || path.kind === 'data' || path.up > 0 || path.names.length === 0) return
  return recordValue(options.record, path.names.join('.'))
}

// A field's value as its enum label where the record's fields give it labels
const labelled = (value: unknown, source: string, options: TextOptions) => {
  const labels = options.fields?.[source]?.valueLabels
  return typeof value === 'string' && labels ? enumLabel(value, labels) : textFieldText(value)
}

const fieldForm =
  (type: string, show: (value: unknown, context: TextContext) => string): TextForm =>
  (context) => {
    const { source, emptyText } = context.node.props as InlineFieldProps
    if (!context.options.record) return ''
    const value = sourceValue(source, context.options)
    if (isEmptyFieldValue(type, value)) return escapeMarkdown(emptyText ?? '')
    return show(value, context)
  }

const TextField = fieldForm('TextField', (value, { node, options }) => escapeMarkdown(labelled(value, String(node.props.source), options)))

const ChipField = fieldForm('ChipField', (value, { node, options }) => escapeMarkdown(labelled(value, String(node.props.source), options)))

const NumberField = fieldForm('NumberField', (value, { node, options }) => escapeMarkdown(numberFieldText(value, node.props as NumberFieldProps, options.locale)))

const DateField = fieldForm('DateField', (value, { node, options }) =>
  escapeMarkdown(dateFieldText(value, node.props as DateFieldProps, { locale: options.locale, now: Date.now(), relative: (seconds) => relativeTimeText(seconds, options.locale) })),
)

const BooleanField = fieldForm('BooleanField', (value, { node }) => escapeMarkdown(booleanFieldText(value as boolean, node.props as BooleanFieldProps, { yes: 'Yes', no: 'No' })))

// A link where the address is safe to follow, else its text alone
const UrlField = fieldForm('UrlField', (value, { node }) => {
  const url = String(value)
  const shown = escapeMarkdown((node.props as UrlFieldProps).content ?? url)
  const safe = safeFieldUrl(url)
  return safe === undefined ? shown : link(shown, safe)
})

export const fieldForms: Record<string, TextForm> = { TextField, NumberField, DateField, BooleanField, UrlField, ChipField }

import type { DiffProps } from '../diff'
import { escapeMarkdown, fenced } from './markdown'
import { sourceValue } from './field-forms'
import type { TextForm } from './text-form'

// A patch as a fenced `diff` block, its fence longer than any run of backticks in it so the patch cannot close it;
// `emptyText` when the field is empty, and nothing when the text has no record to read it from.
const Diff: TextForm = ({ node, options }) => {
  const { source, emptyText } = node.props as DiffProps
  if (!options.record) return ''
  const value = sourceValue(source, options)
  if (value === undefined || value === null || value === '') return escapeMarkdown(emptyText ?? '')
  return fenced(String(value).replace(/\n$/, ''), 'diff')
}

export const diffForms: Record<string, TextForm> = { Diff }

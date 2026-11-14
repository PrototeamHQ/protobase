import type { AppAddress } from '@protobase/schema'
import { blocks, escapeMarkdown, heading, image, labelled, link, strong, valueText } from './markdown'
import { addressHref, recordValue } from './record-value'
import type { TextContext, TextForm, TextOptions } from './text-form'

// Text forms of the blocks that show one thing: a line of text, a link, a value, a button.

const textOf = (value: unknown) => (typeof value === 'string' ? escapeMarkdown(value) : '')

const headingLevels: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 }

// A field of the record around it, under its label; only its label when the text has no record
const fieldText = (name: string, label: string, options: TextOptions) => {
  if (!options.record) return strong(label)
  const value = recordValue(options.record, name)
  if (value === undefined) return ''
  return labelled(label, valueText(value, options.fields?.[name]?.valueLabels))
}

const fieldLabel = (name: string, options: TextOptions) => escapeMarkdown(options.fields?.[name]?.label ?? name)

const Field: TextForm = ({ node, options }) => {
  const { source: name, label } = node.props as { source: string; label?: string | false }
  if (label === false) return options.record ? fieldText(name, '', options) : ''
  return fieldText(name, typeof label === 'string' ? escapeMarkdown(label) : fieldLabel(name, options), options)
}

const statValue = ({ node, options }: TextContext) => {
  const { label, value, resource, filter, field } = node.props
  const shown = textOf(label)
  if (typeof value === 'string' || typeof value === 'number') return labelled(shown, valueText(value))
  if (typeof field === 'string') return fieldText(field, shown, options)
  if (typeof resource === 'string') return strong(link(shown, addressHref({ kind: 'list', resource, ...(typeof filter === 'string' && { filter }) }, options)))
  return strong(shown)
}

const Stat: TextForm = (context) => blocks([statValue(context), textOf(context.node.props.description)])

// A number as it is, or a field of the record around it
const amount = (value: unknown, options: TextOptions) => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !options.record) return
  const read = recordValue(options.record, value)
  return typeof read === 'number' ? read : undefined
}

const Progress: TextForm = ({ node, options }) => {
  const value = amount(node.props.value, options)
  const max = node.props.max === undefined ? 100 : amount(node.props.max, options)
  return labelled(textOf(node.props.label), value === undefined || max === undefined ? '' : `${value} / ${max}`)
}

const Text: TextForm = ({ node, children }) => {
  const level = headingLevels[String(node.props.as)]
  const line = blocks(children)
  return level === undefined ? line : heading(level, line)
}

const Link: TextForm = ({ node, children, options }) => {
  const { href, to } = node.props
  const target = typeof href === 'string' ? href : to ? addressHref(to as AppAddress, options) : undefined
  const shown = blocks(children)
  return target === undefined ? shown : link(shown, target)
}

const Image: TextForm = ({ node }) => {
  const { src, alt } = node.props
  return typeof src === 'string' ? image(textOf(alt), src) : textOf(alt)
}

const Action: TextForm = ({ node }) => textOf(node.props.label ?? node.props.name)

const ModalForm: TextForm = ({ node }) => textOf(node.props.label)

const Composer: TextForm = ({ node }) => textOf(node.props.placeholder)

export const contentForms: Record<string, TextForm> = { Field, Stat, Progress, Text, Link, Image, Action, ModalForm, Composer }

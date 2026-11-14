import type { ReactNode } from 'react'
import { booleanFieldText, dateFieldText, isEmptyFieldValue, numberFieldText, safeFieldUrl, textFieldText, type BooleanFieldProps, type DateFieldProps, type InlineFieldProps, type NumberFieldProps, type UrlFieldProps } from '@protobase/layout'
import { enumLabel, type FieldModel, type FieldViewModel } from '@protobase/schema'
import { formatRelativeTime } from '../../../format/date'
import { formatTag } from '../../../locale/active-locale'
import { text as message } from '../../../live/messages'
import { Skeleton } from '../../../primitives/skeleton'
import { TrueMark } from '../../../primitives/true-mark'
import { useAdminMeta } from '../../meta-gate'
import { ValueBadge } from '../../value-badge'
import { useScopedPathValue } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'

// React-admin's field components: one value of the records around them, inline, formatted as react-admin formats it.

type Shown = { value: unknown; field: FieldModel; hints: FieldViewModel | undefined; props: InlineFieldProps }

/** A field component: its value drawn by `show`, `emptyText` when empty, and nothing while there is no value to read. */
const inlineField = (show: (shown: Shown) => ReactNode) =>
  function InlineFieldBlock({ node, className }: BlockProps) {
    const props = propsOf<InlineFieldProps>(node)
    const { views } = useAdminMeta()
    const read = useScopedPathValue(props.source)
    if (read.state === 'missing') return null
    if (read.state === 'loading') return <Skeleton className="inline-block h-3 w-16 align-middle" />
    if (isEmptyFieldValue(node.type, read.value)) return props.emptyText ? <span className={className}>{props.emptyText}</span> : null
    return <span className={className}>{show({ value: read.value, field: read.field, hints: views[read.model.name]?.fields[read.field.name], props })}</span>
  }

// An enum's value as its label, as everywhere else it is shown
const labelled = ({ value, field, hints }: Shown) => (field.type === 'enum' && typeof value === 'string' ? enumLabel(value, hints?.valueLabels) : textFieldText(value))

export const TextFieldBlock = inlineField(labelled)

export const NumberFieldBlock = inlineField(({ value, props }) => <span className="tabular-nums">{numberFieldText(value, props as NumberFieldProps, formatTag())}</span>)

export const DateFieldBlock = inlineField(({ value, props }) => {
  const shown = dateFieldText(value, props as DateFieldProps, { locale: formatTag(), now: Date.now(), relative: formatRelativeTime })
  return <time dateTime={String(value)}>{shown}</time>
})

export const BooleanFieldBlock = inlineField(({ value, props }) => {
  const words = booleanFieldText(value as boolean, props as BooleanFieldProps, { yes: message('yes'), no: message('no') })
  return value ? <TrueMark label={words} className="align-middle" /> : <span className="text-faint-foreground">{words}</span>
})

// An address that could run code shows as text, not as a link
export const UrlFieldBlock = inlineField(({ value, props }) => {
  const url = String(value)
  const shown = (props as UrlFieldProps).content ?? url
  const safe = safeFieldUrl(url)
  if (safe === undefined) return shown
  return (
    <a href={safe} className="font-medium text-primary-text hover:underline" {...(/^https?:/i.test(safe) && { target: '_blank', rel: 'noreferrer' })}>
      {shown}
    </a>
  )
})

export const ChipFieldBlock = inlineField((shown) => (
  <ValueBadge value={shown.value} hints={shown.hints}>
    {labelled(shown)}
  </ValueBadge>
))

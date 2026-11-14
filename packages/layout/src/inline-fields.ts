import { defineBlock } from './create-node'
import type { Styled } from './blocks'
import type { LayoutChild } from './node'

// React-admin's field components (https://marmelab.com/react-admin/Fields.html): one value of the record around them,
// read by `source` and drawn inline, so they sit in a `Text`, a `Link` or a `Summary` like a word of the sentence.

/** What every field component takes, as react-admin's `FieldProps`: the path of its value, and the text shown when it has none. */
export type InlineFieldProps = Styled & {
  /** A field of the records around it, looked up as `{{path}}` is: `title`, `plan.name`, `../title`. */
  source: string
  /** Shown when the value is empty; nothing is shown without it. */
  emptyText?: string
}

/** Intl options, as `Intl.NumberFormat` or `Intl.DateTimeFormat` take them: names to strings, numbers and booleans. */
export type IntlOptions = Record<string, string | number | boolean>

/** The value as text. https://marmelab.com/react-admin/TextField.html */
export type TextFieldProps = InlineFieldProps
/** A number in the reader's locale, or `locales`, formatted by `Intl.NumberFormat` with `options`. https://marmelab.com/react-admin/NumberField.html */
export type NumberFieldProps = InlineFieldProps & { locales?: string | string[]; options?: IntlOptions }
/**
 * A date, a time or both in the reader's locale, or `locales`, formatted by `Intl.DateTimeFormat` with `options`.
 * `format="relative"`, which react-admin does not have, shows how long ago or ahead it is, such as "3 hours ago".
 * https://marmelab.com/react-admin/DateField.html
 */
export type DateFieldProps = InlineFieldProps & { showDate?: boolean; showTime?: boolean; locales?: string | string[]; options?: IntlOptions; format?: 'relative' }
/** A mark for true and for false, with `valueLabelTrue` and `valueLabelFalse` as its words. https://marmelab.com/react-admin/BooleanField.html */
export type BooleanFieldProps = InlineFieldProps & { valueLabelTrue?: string; valueLabelFalse?: string }
/** A link to the address the value holds, showing `content` or the address. https://marmelab.com/react-admin/UrlField.html */
export type UrlFieldProps = InlineFieldProps & { content?: string }
/** The value as a chip. https://marmelab.com/react-admin/ChipField.html */
export type ChipFieldProps = InlineFieldProps

export const TextField = defineBlock<TextFieldProps>('TextField', false)
export const NumberField = defineBlock<NumberFieldProps>('NumberField', false)
export const DateField = defineBlock<DateFieldProps>('DateField', false)
export const BooleanField = defineBlock<BooleanFieldProps>('BooleanField', false)
export const UrlField = defineBlock<UrlFieldProps>('UrlField', false)
export const ChipField = defineBlock<ChipFieldProps>('ChipField', false)

/** The field components' block types. */
export const inlineFieldTypes: ReadonlySet<string> = new Set(['TextField', 'NumberField', 'DateField', 'BooleanField', 'UrlField', 'ChipField'])

export const isInlineField = (child: LayoutChild) => typeof child !== 'string' && !child.custom && inlineFieldTypes.has(child.type)

/** What runs on in a line of text: text, links, a `Text as="span"` and the field components. */
export const isInlineChild = (child: LayoutChild) => typeof child === 'string' || isInlineField(child) || (!child.custom && (child.type === 'Link' || (child.type === 'Text' && child.props.as === 'span')))

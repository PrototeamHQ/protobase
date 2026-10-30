import type { Locale } from '@protobase/schema/internal'
import { IntlMessageFormat } from 'intl-messageformat'
import { createElement, Fragment, type ReactNode } from 'react'
import { activeLocale, formatTag } from './active-locale'
import en from './en.json' with { type: 'json' }
import nl from './nl.json' with { type: 'json' }

// The built-in texts, one ICU MessageFormat catalogue per language, keyed by area and then id. Every language has
// the English one's shape, which the types check.
type Catalogue = typeof en
export type Namespace = keyof Catalogue
export const catalogues: Record<Locale, Catalogue> = { en, nl }

/** A value a text names: a number picks the plural and is written for the active locale. */
export type MessageValue = string | number | boolean | Date

// The tags every text may use: `<lower>{label}</lower>` writes the label in lower case.
const tags = { lower: (chunks: unknown[]) => chunks.join('').toLowerCase() }

// One compiled format per text and language, so its size is bounded by the catalogues.
const compiled = new Map<string, IntlMessageFormat>()

const formatOf = (namespace: Namespace, id: string) => {
  const locale = activeLocale()
  const key = `${locale}\0${namespace}\0${id}`
  const cached = compiled.get(key)
  if (cached) return cached
  const source = (catalogues[locale][namespace] as Record<string, string>)[id]
  if (source === undefined) throw new Error(`No text ${namespace}.${id} in ${locale}`)
  const format = new IntlMessageFormat(source, formatTag())
  compiled.set(key, format)
  return format
}

/**
 * An area's built-in texts: the lookup returns the one for the active locale, `text('search')` or
 * `text('rows', { count: 3 })`, and `text.rich` the same with React nodes among the values.
 */
export const messages = <N extends Namespace>(namespace: N) => {
  type Id = keyof Catalogue[N] & string
  const text = (id: Id, values?: Record<string, MessageValue>) => formatOf(namespace, id).format({ ...values, ...tags }) as string
  text.rich = (id: Id, values: Record<string, MessageValue | ReactNode>): ReactNode => {
    const parts = formatOf(namespace, id).format<ReactNode>({ ...values, ...tags })
    return Array.isArray(parts) ? createElement(Fragment, null, ...parts) : parts
  }
  return text
}

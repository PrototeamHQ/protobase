import type { Locale } from '@protobase/schema/internal'
import { IntlMessageFormat } from 'intl-messageformat'
import en from './en.json' with { type: 'json' }
import nl from './nl.json' with { type: 'json' }

// The built-in texts, one ICU MessageFormat catalogue per language, keyed by area and then id. Every language has
// the English one's shape, which the types check.
type Catalogue = typeof en
export type Namespace = keyof Catalogue
export const catalogues: Record<Locale, Catalogue> = { en, nl }

/** A value a text names: a number picks the plural and is written for the locale. */
export type MessageValue = string | number | boolean | Date

// The language tag numbers and dates are written with, as the screens do.
const formatTags: Record<Locale, string> = { en: 'en-GB', nl: 'nl-NL' }

// One compiled format per text and language, so its size is bounded by the catalogues.
const compiled = new Map<string, IntlMessageFormat>()

const formatOf = (locale: Locale, namespace: Namespace, id: string) => {
  const key = `${locale}\0${namespace}\0${id}`
  const cached = compiled.get(key)
  if (cached) return cached
  const source = (catalogues[locale][namespace] as Record<string, string>)[id]
  if (source === undefined) throw new Error(`No text ${namespace}.${id} in ${locale}`)
  const format = new IntlMessageFormat(source, formatTags[locale])
  compiled.set(key, format)
  return format
}

/**
 * An area's built-in texts: the lookup gives those of one locale, as the server has no single active one,
 * `text('en')('approve')` or `text(locale)('batchTitle', { count: 3 })`.
 */
export const messages =
  <N extends Namespace>(namespace: N) =>
  (locale: Locale) =>
  (id: keyof Catalogue[N] & string, values?: Record<string, MessageValue>) =>
    formatOf(locale, namespace, id).format(values) as string

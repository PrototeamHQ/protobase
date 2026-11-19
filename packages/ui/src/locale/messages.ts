import type { Locale } from '@protobase/schema/internal'
import { IntlMessageFormat } from 'intl-messageformat'
import { createElement, Fragment, type ReactNode } from 'react'
import { activeLocale, formatTag, setFallbackLocale } from './active-locale'
import type en from './en.json'

// The built-in texts, one ICU MessageFormat catalogue per language, keyed by area and then id. Every language has
// the English one's shape, which the types check.
export type Catalogue = typeof en
export type Namespace = keyof Catalogue

// Each language's catalogue is a chunk of its own, so the app loads only those of the languages it shows.
const loaders: Record<Locale, () => Promise<Catalogue>> = {
  en: () => import('./en.json', { with: { type: 'json' } }).then((module) => module.default),
  nl: () => import('./nl.json', { with: { type: 'json' } }).then((module) => module.default),
}

const loaded: Partial<Record<Locale, Catalogue>> = {}
const loading = new Map<Locale, Promise<void>>()

/** Puts a language's catalogue in place, for what has it at hand rather than loading it (`addAllCatalogues`). */
export const addCatalogue = (locale: Locale, catalogue: Catalogue) => {
  loaded[locale] = catalogue
}

/** Whether a language's texts are loaded, so the screens can be in it. */
export const textsLoaded = (locale: Locale) => loaded[locale] !== undefined

/**
 * Loads a language's built-in texts, once; the screens can be in it when it resolves. A load that fails, such as
 * offline, stays failed until the page loads again, so what waits for it shows the failure once rather than asking
 * again on every draw.
 */
export const loadTexts = (locale: Locale): Promise<void> => {
  if (textsLoaded(locale)) return Promise.resolve()
  const pending = loading.get(locale) ?? loaders[locale]().then((catalogue) => addCatalogue(locale, catalogue))
  loading.set(locale, pending)
  return pending
}

/**
 * Loads a language's built-in texts and draws the app's pieces in it, for a host's own page that draws them outside the
 * app, which awaits it before it renders them; the app picks its language itself.
 */
export const showTextsIn = async (locale: Locale) => {
  await loadTexts(locale)
  setFallbackLocale(locale)
}

/** A loaded language's catalogue. */
export const catalogue = (locale: Locale): Catalogue => {
  const found = loaded[locale]
  if (!found) throw new Error(`The ${locale} texts are not loaded: await loadTexts('${locale}') first`)
  return found
}

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
  const source = (catalogue(locale)[namespace] as Record<string, string>)[id]
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

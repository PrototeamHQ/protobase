import { pickLocale, type Locale } from '@protobase/schema/internal'

// The built-in screens read one locale, so plain functions (formats, messages) need no context: the app's when its
// `/meta` names one, else the fallback the app starts with, the browser's language unless given. Both only ever get
// set to what the app decides on each render, so a part of the tree that renders later never sees another one.
let fallback: Locale = 'en'
let app: Locale | undefined

/** The language the screens are in now. */
export const activeLocale = (): Locale => app ?? fallback

/** The language the screens are in when the app sets none: the browser's, or the one the app was given. */
export const setFallbackLocale = (locale: Locale) => {
  fallback = locale
}

/** The language the app sets for everyone, from its `/meta`; undefined when it sets none. */
export const setAppLocale = (locale: Locale | undefined) => {
  app = locale
}

/** The browser's language when the screens come in it, else English. */
export const browserLocale = (languages = globalThis.navigator?.languages ?? []) => pickLocale(languages)

// The language tag numbers and dates are written with: English as in Ireland and Britain (`6 Oct 2026`, `1,234.5`).
const formatTags: Record<Locale, string> = { en: 'en-GB', nl: 'nl-NL' }

/** The language tag `Intl` formats numbers and dates with, for the active locale. */
export const formatTag = () => formatTags[activeLocale()]

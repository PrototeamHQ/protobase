import type { Locale } from '@protobase/schema/internal'

/** A built-in text: fixed, or made from the values it names. */
type Message = string | ((...values: never[]) => string)

/** A translation of `M`: every message of it, taking the same values. */
export type Translation<M extends Record<string, Message>> = { [K in keyof M]: M[K] extends string ? string : M[K] }

/**
 * An area's built-in texts in every language the screens come in: the lookup gives those of one locale, as the server
 * has no single active one. Dutch must translate every English text, which the types check.
 */
export const defineMessages = <M extends Record<string, Message>>(catalogue: { en: M } & Record<Exclude<Locale, 'en'>, Translation<M>>) =>
  (locale: Locale): M => catalogue[locale] as M

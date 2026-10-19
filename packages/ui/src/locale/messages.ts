import type { Locale } from '@protobase/schema/internal'
import { activeLocale } from './active-locale'

/** A built-in text: fixed, or made from the values it names, such as a count. */
type Message = string | ((...values: never[]) => string)

/** A translation of `M`: every message of it, taking the same values. */
export type Translation<M extends Record<string, Message>> = { [K in keyof M]: M[K] extends string ? string : M[K] }

type Values<T> = T extends (...values: infer V) => string ? V : []

/**
 * An area's built-in texts in every language the screens come in, keyed by id: the lookup returns the one for the
 * active locale, `text('search')` or `text('rows', 3)`. Dutch must translate every English text, which the types check.
 */
export const defineMessages = <M extends Record<string, Message>>(catalogue: { en: M } & Record<Exclude<Locale, 'en'>, Translation<M>>) =>
  <K extends keyof M>(id: K, ...values: Values<M[K]>): string => {
    const message = (catalogue[activeLocale()] as M)[id]
    return typeof message === 'function' ? (message as (...values: unknown[]) => string)(...values) : (message as string)
  }

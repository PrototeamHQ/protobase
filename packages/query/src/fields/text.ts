import { stringValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => stringValue(value, field, 'a string')

const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&')

/** Escapes LIKE wildcards (backslash is LIKE's default escape), then turns the filter wildcard `*` into `%`. */
export const wildcardPattern = (text: string) => escapeLike(text).replaceAll('*', '%')

/** A LIKE pattern for values that contain the text anywhere, taken literally. */
export const containsPattern = (text: string) => `%${escapeLike(text)}%`

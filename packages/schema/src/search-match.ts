import type { ResourceModel, SearchMatch } from './model'

/**
 * One part of a search text. Every word must match a search field; `whole` is the entire text, tried only against
 * `digitsEnd` fields when it holds several words, so a phone number typed with spaces ("+31 6 4706") still finds it.
 */
export type SearchTerm = { text: string; digits: string; whole: boolean }

// Only digits and what phone numbers are written with: a term with letters never matches a digitsEnd field.
const phoneLike = /^[\d\s+\-().\/]+$/

const digitsOf = (text: string) => (phoneLike.test(text) ? text.replace(/\D/g, '') : '')

/** The text's words, and the whole text first when it is a phone number of several words. */
export const searchTerms = (text: string): SearchTerm[] => {
  const words = text.split(/\s+/).filter(Boolean).map((word) => ({ text: word, digits: digitsOf(word), whole: false }))
  const digits = words.length > 1 ? digitsOf(text.trim()) : ''
  return digits ? [{ text: text.trim(), digits, whole: true }, ...words] : words
}

/**
 * Whether one field value matches a term. A plain search field contains the word, ignoring case; a `digitsEnd` field's
 * digits (spaces, `+` and dashes ignored) end with the term's digits. Null never matches.
 */
export const termMatches = (value: unknown, term: SearchTerm, match: SearchMatch | undefined) => {
  if (value === null || value === undefined) return false
  if (match === 'digitsEnd') return term.digits !== '' && String(value).replace(/\D/g, '').endsWith(term.digits)
  return !term.whole && String(value).toLowerCase().includes(term.text.toLowerCase())
}

const matchingFields = (model: ResourceModel, row: Record<string, unknown>, term: SearchTerm) =>
  (model.search ?? []).filter((name) => termMatches(row[name], term, model.searchMatch?.[name]))

/**
 * The server's `search("text")` in memory: every word matches a search field, or the whole text, as a phone number,
 * ends a `digitsEnd` field. Text without words matches nothing. The SQL in `compileSearch` follows the same rules.
 */
export const matchesSearch = (model: ResourceModel, row: Record<string, unknown>, text: string) => {
  const terms = searchTerms(text)
  const words = terms.filter((term) => !term.whole)
  const whole = terms.find((term) => term.whole)
  if (whole && matchingFields(model, row, whole).length > 0) return true
  return words.length > 0 && words.every((term) => matchingFields(model, row, term).length > 0)
}

/**
 * The search field that explains why the record matched when the `shown` fields do not: the first search field matching
 * the first term that matches no shown field. Undefined when the shown fields explain every term the record matched.
 */
export const matchedSearchField = (model: ResourceModel, row: Record<string, unknown>, text: string, shown: string[]) => {
  for (const term of searchTerms(text)) {
    const fields = matchingFields(model, row, term)
    if (fields.length > 0 && !fields.some((name) => shown.includes(name))) return fields[0]
  }
  return undefined
}

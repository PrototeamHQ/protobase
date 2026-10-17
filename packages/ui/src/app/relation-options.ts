import { createWhere, printFilter, type ResourceModel } from '@protobase/schema'

const where = createWhere()

/** The words of typed text, as the list search splits it. */
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean)

/**
 * How a relation picker finds the records that match typed text. A target with search fields uses the list's search;
 * else, when its title field is a filterable text field, every word must appear in it, ignoring case, as the search
 * matches one field. Otherwise, or once the server `refused` such a filter (the scan guard finds no index for it), the
 * picker loads the records page by page and keeps the rows whose title matches (`local`).
 */
export const relationOptionsQuery = (target: ResourceModel, titleField: string, text: string, refused = false) => {
  const words = wordsOf(text)
  if (words.length === 0) return { filter: undefined, local: false }
  if (refused) return { filter: undefined, local: true }
  if (target.search?.length) return { filter: printFilter(where.search(text)), local: false }
  const field = target.fields[titleField]
  if (field?.type !== 'text' || !field.filterable) return { filter: undefined, local: true }
  // `*` is the filter's wildcard, so a typed one is dropped rather than read as "anything".
  const contains = words.map((word) => where.eq(titleField, `*${word.replaceAll('*', '')}*`))
  return { filter: printFilter(where.and(...contains)), local: false }
}

/** Whether a title holds every word of the text, ignoring case: the picker's match on rows it filters itself. */
export const titleMatches = (title: unknown, text: string) => {
  if (title === null || title === undefined) return false
  const value = String(title).toLowerCase()
  return wordsOf(text).every((word) => value.includes(word.toLowerCase()))
}

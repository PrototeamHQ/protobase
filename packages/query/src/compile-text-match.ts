import { sql, type Expression, type SqlBool } from 'kysely'
import { searchTerms, type CheckedFilter, type ResourceModel, type SearchTerm } from '@protobase/schema'
import { containsPattern } from './fields/text'
import { columnRef, findField } from './columns'
import { QueryError } from './errors'

const maxRegexLength = 200

type Node<K extends CheckedFilter['kind']> = Extract<CheckedFilter, { kind: K }>

export const compileRegex = ({ field, pattern }: Node<'regex'>): Expression<SqlBool> => {
  if (pattern.length > maxRegexLength) {
    throw new QueryError('invalid_value', `Regex patterns are limited to ${maxRegexLength} characters`)
  }
  return sql<SqlBool>`${columnRef(field)} ~* ${pattern}`
}

/**
 * pg_trgm: `%` lets a trigram index prune candidates (it applies the session's default threshold, 0.3),
 * and the explicit similarity() check enforces the requested threshold on top of it.
 */
export const compileSimilar = ({ field, text }: Node<'similar'>, threshold: number): Expression<SqlBool> => {
  const col = columnRef(field)
  return sql<SqlBool>`(${col} % ${text} and similarity(${col}, ${text}) >= ${threshold})`
}

/**
 * Partial match across the resource's `search` fields: every whitespace-separated word of the text appears, ignoring
 * case, somewhere in one of them. Each word is an ILIKE per column, so a pg_trgm index on a search column can serve it.
 * A `digitsEnd` field instead matches when its digits end with the word's (spaces, `+` and dashes ignored, and only for
 * words written like phone numbers), or with the whole text's when that is a phone number of several words; a pg_trgm
 * index on `regexp_replace(column, '[^0-9]', '', 'g')` can serve it. `searchTerms` and `matchesSearch` (schema) are the
 * same rules in memory. Text without words matches nothing. A null column is a non-match rather than unknown, so
 * `NOT search(...)` keeps its rows.
 */
export const compileSearch = (model: ResourceModel, { text }: Node<'search'>): Expression<SqlBool> => {
  const names = model.search ?? []
  if (names.length === 0) {
    throw new QueryError('no_search_fields', `Resource "${model.name}" has no search fields; set model.search to use text search`)
  }
  const terms = searchTerms(text)
  const words = terms.filter(term => !term.whole)
  if (words.length === 0) return sql<SqlBool>`false`
  const matchesTerm = (term: SearchTerm) => {
    const matches = names.flatMap(name => {
      const col = sql`${columnRef(findField(model, name))}::text`
      if (model.searchMatch?.[name] === 'digitsEnd') {
        return term.digits ? [sql<SqlBool>`(${col} is not null and regexp_replace(${col}, '[^0-9]', '', 'g') like ${`%${term.digits}`})`] : []
      }
      return term.whole ? [] : [sql<SqlBool>`(${col} is not null and ${col} ilike ${containsPattern(term.text)})`]
    })
    return matches.length > 0 ? sql<SqlBool>`(${sql.join(matches, sql` or `)})` : sql<SqlBool>`false`
  }
  const allWords = sql<SqlBool>`(${sql.join(words.map(matchesTerm), sql` and `)})`
  const whole = terms.find(term => term.whole)
  return whole ? sql<SqlBool>`(${matchesTerm(whole)} or ${allWords})` : allWords
}

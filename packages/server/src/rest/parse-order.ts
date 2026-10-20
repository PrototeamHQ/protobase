import { parseFieldPath, type FieldPath } from './field-path'
import { parseError } from './rest-error'
import { splitList } from './split-list'

/** One term of `order`: a field, its direction and where nulls go, each left to Postgres when not given. */
export type OrderTerm = { field: FieldPath; direction?: 'asc' | 'desc'; nulls?: 'first' | 'last' }

const directions = new Set(['asc', 'desc'])
const nulls = new Set(['nullsfirst', 'nullslast'])

const parseTerm = (text: string): OrderTerm => {
  const [fieldText = '', ...modifiers] = text.trim().split('.')
  const term: OrderTerm = { field: parseFieldPath(fieldText) }
  for (const modifier of modifiers) {
    if (directions.has(modifier) && !term.direction && !term.nulls) term.direction = modifier as OrderTerm['direction']
    else if (nulls.has(modifier) && !term.nulls) term.nulls = modifier === 'nullsfirst' ? 'first' : 'last'
    else throw parseError(`"failed to parse order (${text})"`, `"${modifier}" is neither asc, desc, nullsfirst nor nullslast`)
  }
  return term
}

/** Parses `order`: terms separated by commas, such as `priority.desc.nullslast,id`. */
export const parseOrder = (text: string): OrderTerm[] => splitList(text).map(parseTerm)

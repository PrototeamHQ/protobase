import { parseFilter as parse, type ParseOptions } from 'aip-parsers/filter'
import type { FilterError, FilterExpr } from '../model'
import { lower } from './lower'
import { parseOptions } from './profile'

/** What `parseFilter` gives: the filter, `undefined` for empty text, or the errors in the order they occur in the text. */
export type FilterParse =
  | {
      /** The text parsed. */
      ok: true
      /** The filter, or `undefined` when the text is empty. */
      ast: FilterExpr | undefined
      /** None. */
      errors: []
    }
  | {
      /** The text did not parse. */
      ok: false
      /** As much of the filter as parsed. */
      ast: FilterExpr | undefined
      /** Each problem, with where it is in the text. */
      errors: FilterError[]
    }

/** Bounds on filter text: its length in characters and how deeply its expressions nest. */
export type FilterLimits = Pick<ParseOptions, 'maxLength' | 'maxDepth'>

/**
 * Parses filter text, AIP-160 as the API takes it, into a filter, collecting every error. `maxLength` defaults to
 * 10,000 characters and `maxDepth` to 64. Check the result against a resource with `checkFilter` before running it.
 *
 * @example
 * ```ts
 * const parsed = parseFilter('status = "paid" AND total > 100')
 * if (parsed.ok && parsed.ast) printFilter(parsed.ast) // 'status = "paid" AND total > 100'
 * ```
 */
export const parseFilter = (source: string, limits: FilterLimits = {}): FilterParse => {
  const parsed = parse(source, { ...parseOptions, ...limits })
  const lowering = { errors: [] as FilterError[] }
  const ast = parsed.ast && lower(lowering, parsed.ast)
  const errors = [...parsed.errors, ...lowering.errors].sort((a, b) => a.span.start - b.span.start)
  return errors.length === 0 ? { ok: true, ast, errors: [] } : { ok: false, ast, errors }
}

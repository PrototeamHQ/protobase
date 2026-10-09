import { parseFilter as parse, type ParseOptions } from 'aip-parsers/filter'
import type { FilterError, FilterExpr } from '../model'
import { lower } from './lower'
import { parseOptions } from './profile'

export type FilterParse =
  | { ok: true; ast: FilterExpr | undefined; errors: [] }
  | { ok: false; ast: FilterExpr | undefined; errors: FilterError[] }

export type FilterLimits = Pick<ParseOptions, 'maxLength' | 'maxDepth'>

/**
 * Parses with the library, then lowers to Protobase's filter shape. Collects all errors.
 * `maxLength` defaults to 10,000 characters and `maxDepth` to 64.
 */
export const parseFilter = (source: string, limits: FilterLimits = {}): FilterParse => {
  const parsed = parse(source, { ...parseOptions, ...limits })
  const lowering = { errors: [] as FilterError[] }
  const ast = parsed.ast && lower(lowering, parsed.ast)
  const errors = [...parsed.errors, ...lowering.errors].sort((a, b) => a.span.start - b.span.start)
  return errors.length === 0 ? { ok: true, ast, errors: [] } : { ok: false, ast, errors }
}

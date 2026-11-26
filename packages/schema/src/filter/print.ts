import { printFilter as print } from 'aip-parsers/filter'
import type { CheckedFilter, FilterExpr } from '../model'
import { lift } from './lift'

/** Canonical text, readable by `parseFilter`; OR groups inside AND are always parenthesised. A checked filter prints its fields by name. */
export const printFilter = (ast: FilterExpr | CheckedFilter) => print(lift(ast))

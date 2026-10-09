import { printFilter as print } from 'aip-parsers/filter'
import type { FilterExpr } from '../model'
import { lift } from './lift'

/** Canonical text, readable by `parseFilter`; OR groups inside AND are always parenthesised. */
export const printFilter = (ast: FilterExpr) => print(lift(ast))

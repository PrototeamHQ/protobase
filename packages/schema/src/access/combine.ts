import { createWhere } from '../filter'
import { parseFilter } from '../filter'
import type { FilterExpr } from '../model'
import type { AccessResult } from './types'

const span = { start: 0, end: 0 }

/** Turns an access result into a verdict or a `FilterExpr`. */
export const normalize = (result: AccessResult): boolean | FilterExpr => {
  if (typeof result !== 'string') return result
  const parsed = parseFilter(result)
  if (!parsed.ok || !parsed.ast) throw new Error(`Access rule returned an invalid filter "${result}": ${parsed.errors[0]?.message ?? 'empty'}`)
  return parsed.ast
}

export const andResults = (a: AccessResult, b: AccessResult): boolean | FilterExpr => {
  const [x, y] = [normalize(a), normalize(b)]
  if (x === false || y === false) return false
  if (x === true) return y
  if (y === true) return x
  return { kind: 'and', args: [x, y], span }
}

export const orResults = (a: AccessResult, b: AccessResult): boolean | FilterExpr => {
  const [x, y] = [normalize(a), normalize(b)]
  if (x === true || y === true) return true
  if (x === false) return y
  if (y === false) return x
  return { kind: 'or', args: [x, y], span }
}

export const where = createWhere()

import type { BaseType } from './type-map'

const relationTargets: BaseType[] = ['integer', 'bigint', 'uuid', 'text']

// Whether a declared field type can sensibly represent a column whose Postgres type maps to `base`.
export const typesCompatible = (declared: string, base: BaseType) => {
  if (declared === base) return true
  if (declared === 'relation') return relationTargets.includes(base)
  if (declared === 'currency' || declared === 'country') return base === 'text'
  if (declared === 'enum') return base === 'text'
  if (declared === 'text') return base === 'enum'
  return false
}

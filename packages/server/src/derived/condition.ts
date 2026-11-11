/** A value a condition compares with: what a query's constant or parameter holds. */
export type Scalar = string | number | boolean | null

export type CompareOp = '=' | '<>' | '<' | '<=' | '>' | '>='

/**
 * Which rows of a table a read depends on, by field name once recorded (by column while a query is analysed). `maybe`
 * is a part that could not be worked out: it holds for every row, so the read widens rather than misses a change.
 */
export type Condition =
  | { maybe: true }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { field: string; op: CompareOp; value: Scalar }
  | { field: string; op: 'in'; values: Scalar[] }
  | { field: string; op: 'null' | 'notNull' }

export const maybe: Condition = { maybe: true }

/** `true`, `false`, or `undefined` when it cannot be told: a value of a type the comparison does not know. */
type Truth = boolean | undefined

// Types whose values compare exactly as text, whichever of number or text a row or a parameter holds them as.
const exactTypes = new Set(['integer', 'bigint', 'text', 'uuid', 'enum', 'boolean', 'relation', 'currency', 'country'])
const numberTypes = new Set(['integer', 'bigint', 'decimal'])
const timeTypes = new Set(['timestamp', 'date'])

/** A value of an exactly compared type as text, a uuid in the one form Postgres compares it by. */
const exactText = (type: string | undefined, value: unknown) => (type === 'uuid' ? String(value).toLowerCase().replace(/[{}-]/g, '') : String(value))

const equal = (type: string | undefined, a: unknown, b: Scalar): Truth => {
  if (a === null || a === undefined || b === null) return undefined
  if (a === b) return true
  if (type !== undefined && exactTypes.has(type) && (typeof a !== 'object' || a === null)) return exactText(type, a) === exactText(type, b)
  return undefined
}

const ordered = (type: string | undefined, a: unknown, b: Scalar) => {
  if (a === null || a === undefined || b === null || type === undefined) return undefined
  if (numberTypes.has(type) && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Math.sign(Number(a) - Number(b))
  if (timeTypes.has(type) && !Number.isNaN(Date.parse(String(a))) && !Number.isNaN(Date.parse(String(b)))) return Math.sign(Date.parse(String(a)) - Date.parse(String(b)))
  return undefined
}

const compare = (op: CompareOp, type: string | undefined, a: unknown, b: Scalar): Truth => {
  if (a === null && b !== undefined) return false
  if (op === '=') return equal(type, a, b)
  if (op === '<>') {
    const same = equal(type, a, b)
    return same === undefined ? undefined : !same
  }
  const sign = ordered(type, a, b)
  if (sign === undefined) return undefined
  return { '<': sign < 0, '<=': sign <= 0, '>': sign > 0, '>=': sign >= 0 }[op]
}

const any = (truths: Truth[]) => (truths.includes(true) ? true : truths.includes(undefined) ? undefined : false)
const all = (truths: Truth[]) => (truths.includes(false) ? false : truths.includes(undefined) ? undefined : true)

/**
 * Whether a record, by field name, may meet the condition: three-valued, so a field the record lacks (a sensitive one)
 * or a value whose type cannot be compared counts as "may", never as "does not".
 */
const truth = (condition: Condition, record: Record<string, unknown>, types: Record<string, string>): Truth => {
  if ('maybe' in condition) return undefined
  if ('and' in condition) return all(condition.and.map((part) => truth(part, record, types)))
  if ('or' in condition) return any(condition.or.map((part) => truth(part, record, types)))
  if ('not' in condition) {
    const inner = truth(condition.not, record, types)
    return inner === undefined ? undefined : !inner
  }
  if (!Object.hasOwn(record, condition.field)) return undefined
  const value = record[condition.field]
  if ('values' in condition) return any(condition.values.map((item) => compare('=', types[condition.field], value, item)))
  if ('value' in condition) return compare(condition.op, types[condition.field], value, condition.value)
  return condition.op === 'null' ? value === null : value !== null
}

/** Whether the record may meet the condition; `types` are the record's field types by name. */
export const mayMatch = (condition: Condition, record: Record<string, unknown>, types: Record<string, string>) => truth(condition, record, types) !== false

/**
 * The field and value of an equality every matching row has, for the index that finds a change's candidate reads;
 * `undefined` when the condition has none of a type that compares exactly.
 */
export const equalityOf = (condition: Condition, types: Record<string, string>): { field: string; value: string } | undefined => {
  if ('and' in condition) return condition.and.map((part) => equalityOf(part, types)).find(Boolean)
  if (!('op' in condition) || condition.op !== '=' || condition.value === null) return undefined
  const type = types[condition.field]
  return exactTypes.has(type ?? '') ? { field: condition.field, value: exactText(type, condition.value) } : undefined
}

/** A record's values as the equality index holds them: text, for the fields of a type that compares exactly. */
export const equalityKeys = (record: Record<string, unknown>, types: Record<string, string>) =>
  Object.entries(record)
    .filter(([field, value]) => exactTypes.has(types[field] ?? '') && value !== null && typeof value !== 'object')
    .map(([field, value]) => ({ field, value: exactText(types[field], value) }))

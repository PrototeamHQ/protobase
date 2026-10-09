import type { FieldPath, FilterExpr, FilterValue, Literal, Span } from '../model'
import type { Field } from '../field'
import type { RecordOf } from '../resource-types'
import { parseDurationText } from './duration'

type Scalar = string | number | boolean
type Source = { readonly $fields: unknown }
type Fields<R extends Source> = keyof RecordOf<R['$fields']> & string
type Value<R extends Source, K extends Fields<R>> =
  | Extract<NonNullable<RecordOf<R['$fields']>[K]>, Scalar>
  | FilterValue
type Anything = { readonly $fields: Record<string, Field<any>> }

const span: Span = { start: 0, end: 0 }
const field = (name: string): FieldPath => ({ kind: 'field', path: name.split('.'), span })

const literal = (value: Scalar): Literal => {
  if (typeof value === 'string') return { kind: 'string', value, span }
  if (typeof value === 'boolean') return { kind: 'boolean', value, span }
  if (!Number.isFinite(value)) throw new Error('Filter numbers must be finite')
  return { kind: 'number', value, raw: String(value), span }
}

const filterValue = (value: Scalar | FilterValue): FilterValue =>
  typeof value === 'object' ? value : literal(value)

const group = (kind: 'and' | 'or', args: FilterExpr[]): FilterExpr => {
  if (args.length === 0) throw new Error(`where.${kind} needs at least one filter`)
  if (args.length === 1) return args[0]!
  return { kind, args, span }
}

// Builds ASTs for code and the UI; field names and values are typed against the resource.
export const createWhere = <R extends Source = Anything>() => {
  const compare =
    (op: '=' | '!=' | '<' | '<=' | '>' | '>=') =>
    <K extends Fields<R>>(name: K, value: Value<R, K>): FilterExpr => ({
      kind: 'compare',
      op,
      field: field(name),
      value: filterValue(value),
      span,
    })
  const offset = (sign: '+' | '-') => (duration: string): FilterValue => ({
    kind: 'now',
    offset: { sign, duration: parseDurationText(duration) },
    span,
  })

  return {
    eq: compare('='),
    ne: compare('!='),
    lt: compare('<'),
    lte: compare('<='),
    gt: compare('>'),
    gte: compare('>='),
    between: <K extends Fields<R>>(name: K, low: Value<R, K>, high: Value<R, K>) =>
      group('and', [compare('>=')(name, low), compare('<=')(name, high)]),
    has: <K extends Fields<R>>(name: K, value: Scalar) =>
      ({ kind: 'has', field: field(name), value: literal(value), span }) as FilterExpr,
    present: <K extends Fields<R>>(name: K) => ({ kind: 'present', field: field(name), span }) as FilterExpr,
    in: <K extends Fields<R>>(name: K, values: Extract<NonNullable<RecordOf<R['$fields']>[K]>, Scalar>[]) =>
      ({ kind: 'in', field: field(name), values: values.map(literal), span }) as FilterExpr,
    isNull: <K extends Fields<R>>(name: K) => ({ kind: 'isNull', field: field(name), span }) as FilterExpr,
    search: (text: string): FilterExpr => ({ kind: 'search', text, span }),
    similar: <K extends Fields<R>>(name: K, text: string) =>
      ({ kind: 'similar', field: field(name), text, span }) as FilterExpr,
    regex: <K extends Fields<R>>(name: K, pattern: string) =>
      ({ kind: 'regex', field: field(name), pattern, span }) as FilterExpr,
    and: (...args: FilterExpr[]) => group('and', args),
    or: (...args: FilterExpr[]) => group('or', args),
    not: (arg: FilterExpr): FilterExpr => ({ kind: 'not', arg, span }),
    now: (): FilterValue => ({ kind: 'now', span }),
    ago: offset('-'),
    fromNow: offset('+'),
  }
}

export const where = createWhere()

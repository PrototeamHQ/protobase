import type { FieldPath, FilterExpr, FilterValue, Literal, Span } from '../model'
import type { Field } from '../field'
import type { RecordOf } from '../resource-types'
import { parseDurationText } from './duration'

/** @inline */
type Scalar = string | number | boolean
/** @inline */
type Source = {
  /** The resource's fields, as `resource(...)` declares them. */
  readonly $fields: unknown
}
/** @inline */
type Fields<R extends Source> = keyof RecordOf<R['$fields']> & string
/** @inline */
type Value<R extends Source, K extends Fields<R>> =
  | Extract<NonNullable<RecordOf<R['$fields']>[K]>, Scalar>
  | FilterValue
/** @inline */
type Anything = {
  /** Any fields: names and values are not checked. */
  readonly $fields: Record<string, Field<any>>
}

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

/**
 * Builds filters in code, for the client and the UI, as `where` does, with field names and values typed against the
 * resource `R`: `createWhere<typeof orders>().eq('status', 'paid')`. A filter it builds prints as filter text with
 * `printFilter`.
 */
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
    /** The field equals the value: `status = "paid"`. */
    eq: compare('='),
    /** The field differs from the value: `status != "paid"`. */
    ne: compare('!='),
    /** The field is below the value: `total < 100`. */
    lt: compare('<'),
    /** The field is at most the value: `total <= 100`. */
    lte: compare('<='),
    /** The field is above the value: `total > 100`. */
    gt: compare('>'),
    /** The field is at least the value: `total >= 100`. */
    gte: compare('>='),
    /** The field lies from `low` to `high`, both included. */
    between: <K extends Fields<R>>(name: K, low: Value<R, K>, high: Value<R, K>) =>
      group('and', [compare('>=')(name, low), compare('<=')(name, high)]),
    /** A JSON field holds the value, as a key or an element: `tags:"urgent"`. */
    has: <K extends Fields<R>>(name: K, value: Scalar) =>
      ({ kind: 'has', field: field(name), value: literal(value), span }) as FilterExpr,
    /** The field has a value, a JSON field one other than `null`: `field:*`. */
    present: <K extends Fields<R>>(name: K) => ({ kind: 'present', field: field(name), span }) as FilterExpr,
    /** The field equals one of the values: `in(status, "paid", "sent")`. */
    in: <K extends Fields<R>>(name: K, values: Extract<NonNullable<RecordOf<R['$fields']>[K]>, Scalar>[]) =>
      ({ kind: 'in', field: field(name), values: values.map(literal), span }) as FilterExpr,
    /** The field has no value: `isNull(field)`. */
    isNull: <K extends Fields<R>>(name: K) => ({ kind: 'isNull', field: field(name), span }) as FilterExpr,
    /** Every word of the text appears, ignoring case, in one of the resource's search fields: `search("text")`. */
    search: (text: string): FilterExpr => ({ kind: 'search', text, span }),
    /** The text field is close to the text by trigram similarity, typos included: `similar(field, "text")`. */
    similar: <K extends Fields<R>>(name: K, text: string) =>
      ({ kind: 'similar', field: field(name), text, span }) as FilterExpr,
    /** The text field matches the regular expression, ignoring case: `regex(field, "pattern")`. */
    regex: <K extends Fields<R>>(name: K, pattern: string) =>
      ({ kind: 'regex', field: field(name), pattern, span }) as FilterExpr,
    /** Every filter holds; one filter is returned as it is, none throws. */
    and: (...args: FilterExpr[]) => group('and', args),
    /** At least one filter holds; one filter is returned as it is, none throws. */
    or: (...args: FilterExpr[]) => group('or', args),
    /** The filter does not hold. */
    not: (arg: FilterExpr): FilterExpr => ({ kind: 'not', arg, span }),
    /** The current time, as a value to compare with: `now()`. */
    now: (): FilterValue => ({ kind: 'now', span }),
    /** A time the duration before now, such as `ago('7d')` for `now() - 7d`; units are `s`, `m`, `h`, `d` and `w`. */
    ago: offset('-'),
    /** A time the duration after now, such as `fromNow('1h')` for `now() + 1h`. */
    fromNow: offset('+'),
  }
}

/**
 * Builds a filter in code instead of writing filter text, for any resource; `createWhere` checks names and values
 * against one. The [Filters](docs/website/src/content/docs/reference/api.md#filters) of the API take what it builds.
 *
 * @example
 * ```ts
 * where.and(where.eq('status', 'paid'), where.gte('created_at', where.ago('30d')))
 * ```
 */
export const where = createWhere()

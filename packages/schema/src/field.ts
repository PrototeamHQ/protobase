import { z } from 'zod'
import type { FieldAccess } from './access/types'
import { promptError } from './ai-prompt'
import type { FieldType } from './model'
import type { FileOptions } from './files/file-options'
import { parseFormula } from './computed/formula'
import type { Rollup } from './computed/rollup'
import type { Encrypted } from './encrypted-value'

/** A check on the value that only some field types take: `.min()`, `.max()` and `.regex()`. */
export type Constraint = 'min' | 'max' | 'regex'

/** Everything a field's builder methods have set, from which the resource's {@link FieldModel} is built. */
export type FieldMeta = {
  /** The field's type. */
  type: FieldType
  /** The column, when it is not the snake_case of the field's name (`.column()`). */
  column?: string
  /** Whether the value may be `null` (`.optional()`). */
  nullable: boolean
  /** Whether the API never writes it (`.readOnly()`). */
  readOnly: boolean
  /** Whether filters may use it (`.filterable()`). */
  filterable: boolean
  /** Whether sorts may use it (`.sortable()`). */
  sortable: boolean
  /** Other names filters may use for it (`.alias()`). */
  aliases: string[]
  /** Whether `.default()` gave it a value. */
  hasDefault: boolean
  /** The value of `.default()`. */
  defaultValue?: unknown
  /** Whether the database supplies a value when none is given (`.dbDefault()`). */
  dbDefault?: boolean
  /** Its role rules (`.access()`). */
  access?: FieldAccess
  /** Whether it is hidden like a password (`.sensitive()`). */
  sensitive?: boolean
  /** Whether it is stored encrypted, and so sensitive too (`.encrypted()`). */
  encrypted?: boolean
  /** How recent a strong sign-in its reveal needs, and so sensitive too (`.strongSignIn()`). */
  strongSignIn?: {
    /** The most minutes since the sign-in, or its confirmation, proved a passkey or a second step. */
    minutes: number
  }
  /** An enum's values (`f.enum()`). */
  enumValues?: string[]
  /** A relation's resource and the columns that hold its key (`f.relation()`, `.columns()`). */
  relation?: {
    /** The resource it points at. */
    resource: string
    /** The columns holding the other record's key, in the order of that key; the field's own column when omitted. */
    columns?: string[]
  }
  /** A decimal's number of digits (`f.decimal()`). */
  precision?: number
  /** A decimal's number of digits after the point (`f.decimal()`). */
  scale?: number
  /** The least value, or for text the shortest length (`.min()`). */
  min?: number
  /** The greatest value, or for text the longest length (`.max()`). */
  max?: number
  /** A pattern the text must match (`.regex()`). */
  regex?: {
    /** The pattern. */
    re: RegExp
    /** The message of the issue a value that does not match gets. */
    message: string
  }
  /** A file field's settings (`f.file()`). */
  file?: FileOptions
  /** How a job fills it (`.ai()`). */
  ai?: {
    /** The prompt the job fills it from. */
    prompt: string
  }
  /** What the database keeps it from: the records of another resource (`.rollup()`). */
  rollup?: Rollup
  /** The expression the database computes it from, over the record's other fields (`.formula()`). */
  formula?: string
}

/** A field type: its name, the constraints it takes and how it builds the schema that checks a value. */
export type FieldTypeDef = {
  /** The field type it defines. */
  type: FieldType
  /** The constraints its fields may use; any other throws when the config loads. */
  constraints: readonly Constraint[]
  /** The Zod schema of a value, from the field's settings. */
  build: (meta: FieldMeta) => z.ZodType
}

export const fieldRegistry = z.registry<FieldMeta>()

/**
 * A field of a resource, holding values of type `V`, as `f` builds it. Every option returns a new field, so they chain
 * in any order. See [Field options](docs/website/src/content/docs/reference/data-config.mdx#field-options).
 */
export class Field<V> {
  /** The Zod schema a value is checked with on every create and update: the type's, nullable and defaulted as set. */
  readonly schema: z.ZodType<V>

  constructor(
    /** Its field type. */
    readonly def: FieldTypeDef,
    /** What its builder methods have set. */
    readonly meta: FieldMeta,
  ) {
    let schema = def.build(meta)
    if (meta.nullable) schema = schema.nullable()
    if (meta.hasDefault) schema = schema.default(meta.defaultValue as never)
    // Zod maps the meta type member by member, which a file field's processor functions do not survive
    this.schema = schema.register(fieldRegistry, meta as never) as z.ZodType<V>
  }

  /** The column, when it is not the snake_case of the field's name, such as `'EMP_NAME'`. */
  column(name: string) {
    return this.with({ column: name })
  }

  /** Never written through the API: ids, computed columns, audit timestamps. */
  readOnly() {
    return this.with({ readOnly: true })
  }

  /** The column is nullable: the value may be `null`. */
  optional() {
    return this.with({ nullable: true }) as unknown as Field<V | null>
  }

  /** The value a create uses when none is given; the admin's create form shows it. */
  default(value: V) {
    return this.with({ hasDefault: true, defaultValue: value })
  }

  /**
   * Role-based rules for reading and writing this column. They never see a record, so the set of
   * readable columns is fixed per request. A field without a rule follows its resource.
   */
  access(rules: FieldAccess) {
    return this.with({ access: { ...this.meta.access, ...rules } })
  }

  /**
   * Hidden like a password: never part of a list, record, search or write response. A caller who may read it fetches the
   * value of one record on its own (`POST /{resource}/{key}:reveal`), and every reveal is published as an audit event.
   */
  sensitive() {
    return this.with({ sensitive: true })
  }

  /**
   * Stored encrypted with the app's own key (`PROTOBASE_ENCRYPTION_KEY`): the database only ever holds ciphertext. It is
   * sensitive too, so only its reveal decrypts it, and record rules, validators and hooks get a set stored value as
   * {@link encrypted}, never the value. Only `f.text()` takes it. See
   * [Encrypted fields](docs/website/src/content/docs/reference/data-config.mdx#encrypted-fields).
   */
  encrypted() {
    if (this.meta.type !== 'text') throw new Error('.encrypted() takes only f.text() fields')
    return this.with({ encrypted: true, sensitive: true }) as unknown as Field<V | Encrypted>
  }

  /**
   * Revealing it needs a strong sign-in: one that proved a passkey or a second step, made or confirmed in the last
   * `minutes` (15 by default). Otherwise the reveal is refused with `403 strong-sign-in-required`, and the record page
   * asks the person to confirm it's them first. It is sensitive too. See
   * [Recent strong sign-in](docs/website/src/content/docs/reference/data-config.mdx#recent-strong-sign-in).
   */
  strongSignIn(o: { minutes?: number } = {}) {
    const minutes = o.minutes ?? 15
    if (!Number.isInteger(minutes) || minutes < 1) throw new Error('.strongSignIn(): minutes must be a whole number of at least 1')
    return this.with({ strongSignIn: { minutes }, sensitive: true })
  }

  /** The database supplies a value when none is given (identity, now(), ...). */
  dbDefault() {
    return this.with({ dbDefault: true })
  }

  /** Other names filters may use for the field. */
  alias(...names: string[]) {
    return this.with({ aliases: [...this.meta.aliases, ...names] })
  }

  /** The field may appear in `filter`, in filter widgets and in the filters of composed pages. Give it an index. */
  filterable() {
    return this.with({ filterable: true })
  }

  /** The field may appear in `order_by` and in sorts. */
  sortable() {
    return this.with({ sortable: true })
  }

  /** Text must match `re`; a value that does not gets an issue with `message`. Only `f.text()` takes it. */
  regex(re: RegExp, message: string) {
    return this.constrain('regex', { regex: { re, message } })
  }

  /** The least value of an integer, or the shortest length of a text. Only `f.integer()` and `f.text()` take it. */
  min(value: number) {
    return this.constrain('min', { min: value })
  }

  /** The greatest value of an integer, or the longest length of a text. Only `f.integer()` and `f.text()` take it. */
  max(value: number) {
    return this.constrain('max', { max: value })
  }

  /**
   * A job fills the field from `prompt`, `{field}` replaced by the record's values, after a create, and after an update
   * that changes a field the prompt names, as the user who wrote; see [AI fields and actions](docs/website/src/content/docs/reference/ai.mdx).
   */
  ai(o: { prompt: string }) {
    const error = promptError(o.prompt)
    if (error) throw new Error(`.ai(): ${error}`)
    return this.with({ ai: { prompt: o.prompt } })
  }

  /**
   * The database keeps the field: a column a trigger on `from`'s table sets to `fn` of the records whose `via` points at
   * this record, in the transaction that writes them. `count` and `sum` are 0 without records; `avg`, `min` and `max`
   * are empty, so their fields are `.optional()`. Empty values are left out, as in SQL. Read-only; `protobase migration`
   * writes the column and its trigger. See [Rollups and formulas](docs/website/src/content/docs/reference/data-config.mdx#rollups-and-formulas).
   *
   * @example
   * ```ts
   * total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'order_lines', via: 'order_id', fn: 'sum', field: 'amount' }),
   * ```
   */
  rollup(o: Rollup) {
    return this.with({ rollup: { ...o }, readOnly: true })
  }

  /**
   * The database computes the field from the record's other number fields: a generated column. `expression` takes
   * numbers, fields, `+ - * /`, parentheses, `coalesce(a, b, ...)` and `round(x, digits)`, computed exactly as decimals and
   * stored as the field's type. Read-only; `protobase migration` writes the column. See
   * [Rollups and formulas](docs/website/src/content/docs/reference/data-config.mdx#rollups-and-formulas).
   *
   * @example
   * ```ts
   * amount: f.decimal({ precision: 12, scale: 2 }).formula('round(quantity * unit_price, 2)'),
   * ```
   */
  formula(expression: string) {
    parseFormula(expression)
    return this.with({ formula: expression, readOnly: true })
  }

  /** A copy of the field with `patch` applied, which every option returns. */
  protected with(patch: Partial<FieldMeta>): Field<V> {
    return new Field<V>(this.def, { ...this.meta, ...patch })
  }

  private constrain(constraint: Constraint, patch: Partial<FieldMeta>) {
    if (!this.def.constraints.includes(constraint)) {
      throw new Error(`f.${this.def.type} does not support .${constraint}()`)
    }
    return this.with(patch)
  }
}

/** A field of any value type. */
export type AnyField = Field<any>

import { z } from 'zod'
import type { FieldAccess } from './access/types'
import type { FieldType } from './model'

export type Constraint = 'min' | 'max' | 'regex'

export type FieldMeta = {
  type: FieldType
  column?: string
  nullable: boolean
  readOnly: boolean
  filterable: boolean
  sortable: boolean
  aliases: string[]
  hasDefault: boolean
  defaultValue?: unknown
  dbDefault?: boolean
  access?: FieldAccess
  sensitive?: boolean
  enumValues?: string[]
  relation?: { resource: string; columns?: string[] }
  precision?: number
  scale?: number
  min?: number
  max?: number
  regex?: { re: RegExp; message: string }
}

export type FieldTypeDef = {
  type: FieldType
  constraints: readonly Constraint[]
  build: (meta: FieldMeta) => z.ZodType
}

export const fieldRegistry = z.registry<FieldMeta>()

export class Field<V> {
  readonly schema: z.ZodType<V>

  constructor(
    readonly def: FieldTypeDef,
    readonly meta: FieldMeta,
  ) {
    let schema = def.build(meta)
    if (meta.nullable) schema = schema.nullable()
    if (meta.hasDefault) schema = schema.default(meta.defaultValue as never)
    this.schema = schema.register(fieldRegistry, meta) as z.ZodType<V>
  }

  column(name: string) {
    return this.with({ column: name })
  }

  readOnly() {
    return this.with({ readOnly: true })
  }

  optional() {
    return this.with({ nullable: true }) as unknown as Field<V | null>
  }

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

  /** The database supplies a value when none is given (identity, now(), ...). */
  dbDefault() {
    return this.with({ dbDefault: true })
  }

  alias(...names: string[]) {
    return this.with({ aliases: [...this.meta.aliases, ...names] })
  }

  filterable() {
    return this.with({ filterable: true })
  }

  sortable() {
    return this.with({ sortable: true })
  }

  regex(re: RegExp, message: string) {
    return this.constrain('regex', { regex: { re, message } })
  }

  min(value: number) {
    return this.constrain('min', { min: value })
  }

  max(value: number) {
    return this.constrain('max', { max: value })
  }

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

export type AnyField = Field<any>

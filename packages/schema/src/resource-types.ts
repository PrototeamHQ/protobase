import type { AccessAction, AccessFn } from './access/types'
import type { Field } from './field'
import type { ActiveFields, Ref } from './refs'

type Prettify<T> = { [K in keyof T]: T[K] } & {}

/** The record of a resource with fields `F`: each field's value type by name, the ignored (`null`) ones left out. */
export type RecordOf<F> = Prettify<{
  [K in keyof ActiveFields<F>]: ActiveFields<F>[K] extends Field<infer V> ? V : never
}>

/** What `.primaryKey()` picks: one field, or a list for a key of several columns. */
export type KeyRefs = Ref | readonly Ref[]

/** A record's key from the fields `.primaryKey()` picked: one value, or a tuple of the parts. */
export type KeyOf<K> = K extends readonly Ref[]
  ? { -readonly [I in keyof K]: K[I] extends Ref<string, infer V> ? V : never }
  : K extends Ref<string, infer V>
    ? V
    : never

/** A problem `.validate()` finds with a record, answered with `400` and the field named. */
export type Issue<F> = {
  /** The field it is about. */
  field: keyof RecordOf<F> & string
  /** What is wrong, for the user. */
  message: string
}

/** Resource-level rules: operation, row filter and record-level check in one function. */
export type Access<F> = { [A in AccessAction]?: AccessFn<RecordOf<F>> }

/**
 * The record type of a resource, from the builder `resource(...)` returns: `InferRecord<typeof orders>`.
 *
 * @typeParam R - The resource builder, whose `$fields` carries its fields.
 */
export type InferRecord<
  R extends {
    /** The builder's fields, as a type only. */
    readonly $fields: unknown
  },
> = RecordOf<R['$fields']>

/**
 * The key type of a resource, from the builder `resource(...)` returns: `RecordKey<typeof stock>`.
 *
 * @typeParam R - The resource builder, whose `$key` carries the fields of its key.
 */
export type RecordKey<
  R extends {
    /** The fields of the builder's key, as a type only. */
    readonly $key: unknown
  },
> = KeyOf<R['$key']>

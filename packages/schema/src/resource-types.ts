import type { AccessAction, AccessFn } from './access/types'
import type { Field } from './field'
import type { ActiveFields, Ref } from './refs'

type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type RecordOf<F> = Prettify<{
  [K in keyof ActiveFields<F>]: ActiveFields<F>[K] extends Field<infer V> ? V : never
}>

export type KeyRefs = Ref | readonly Ref[]

export type KeyOf<K> = K extends readonly Ref[]
  ? { -readonly [I in keyof K]: K[I] extends Ref<string, infer V> ? V : never }
  : K extends Ref<string, infer V>
    ? V
    : never

export type Issue<F> = { field: keyof RecordOf<F> & string; message: string }

/** Resource-level rules: operation, row filter and record-level check in one function. */
export type Access<F> = { [A in AccessAction]?: AccessFn<RecordOf<F>> }

export type InferRecord<R extends { readonly $fields: unknown }> = RecordOf<R['$fields']>

export type RecordKey<R extends { readonly $key: unknown }> = KeyOf<R['$key']>

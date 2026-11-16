import type { InferRecord, ResourceBuilder } from '@protobase/schema'
import type { Condition, Now } from './record'

/**
 * What the app's own types fill in, through the `.protobase/register.d.ts` that `protobase types` and `protobase dev`
 * write: `interface Register { app: typeof import('../config/index') }`. Without it every name is a `string`.
 */
export interface Register {}

type App = Register extends { app: infer A extends object } ? A : {}

// The resource builders a module exports, by the name each was given
type BuilderOf<V> = V extends ResourceBuilder<any, any, infer N> ? (string extends N ? never : V) : never
type BuildersIn<A> = { [K in keyof A]: BuilderOf<A[K]> }[keyof A]

/** The resources a config module exports, by name: what `ResourceName` and `RecordOf` read for the app's own. */
export type ResourcesIn<A> = { [B in BuildersIn<A> as B extends { $name: infer N extends string } ? N : never]: B }

/** The resource names a config module exports, or any name when it exports none. */
export type ResourceNameIn<A> = [BuildersIn<A>] extends [never] ? string : keyof ResourcesIn<A> & string

/** A record of resource `R` of a config module, as its fields type it. */
export type RecordIn<A, R extends string> = R extends keyof ResourcesIn<A> ? (ResourcesIn<A>[R] extends { readonly $fields: unknown } ? InferRecord<ResourcesIn<A>[R]> : never) : Record<string, unknown>

/** The app's resource names, or any name without the generated types. */
export type ResourceName = ResourceNameIn<App>

/** A record of resource `R` as its fields type it, or any record without the generated types. */
export type RecordOf<R extends string> = RecordIn<App, R>

/** The field names of resource `R`. */
export type FieldName<R extends string> = keyof RecordOf<R> & string

/** A sort entry: a field, ascending, or a field and `asc` or `desc`. */
export type Sort<R extends string> = FieldName<R> | `${FieldName<R>} asc` | `${FieldName<R>} desc`

/** What a value can be compared with: one like it, a recorded path or, for times, `now()`. */
type Comparable<T> = T | Recorded<T> | (T extends string | Date ? Now : never)

/** A value in a condition, which compares with others: `f.status.eq('done')`, `data.total.gt(100)`. */
export type Operand<T> = {
  eq(value: Comparable<T> | null): Condition
  ne(value: Comparable<T> | null): Condition
  lt(value: Comparable<T>): Condition
  le(value: Comparable<T>): Condition
  gt(value: Comparable<T>): Condition
  ge(value: Comparable<T>): Condition
  in(values: readonly Comparable<T>[]): Condition
  /** A JSON or list field holds the value: `tags:"urgent"`. */
  contains(value: unknown): Condition
  isNull(): Condition
}

/**
 * A recorded value of type `T`, read in a typed layout: its placeholder where it ends up as text, `{{plan.name}}`,
 * a field to compare in a condition, and each of its own fields read the same way.
 */
export type Recorded<T> = string extends keyof NonNullable<T>
  ? any
  : Operand<NonNullable<T>> & { toString(): string } & (NonNullable<T> extends readonly (infer I)[]
    ? { readonly $item?: I }
    : NonNullable<T> extends Date
      ? {}
      : NonNullable<T> extends object
        ? { readonly [K in keyof NonNullable<T>]-?: Recorded<NonNullable<T>[K]> }
        : {})

/** The fields of resource `R` as a filter's arrow is given them: `(f) => f.enabled.eq(true)`. */
export type Fields<R extends string> = string extends FieldName<R>
  ? any
  : { readonly [K in FieldName<R>]-?: Operand<NonNullable<RecordOf<R>[K]>> & (NonNullable<RecordOf<R>[K]> extends object ? Fields<string> : {}) }

/** A filter of resource `R`'s records: the builder's arrow, or AIP-160 text for what it does not write, such as `regex(...)`. */
export type Filter<R extends string> = string | ((fields: Fields<R>) => Condition)

/** The app's tables as a condition counts them: `resources.loop_held.count.gt(0)`. */
export type Resources = string extends ResourceName ? any : { readonly [R in ResourceName]: { readonly count: Operand<number> } }

import type { AnyField, Field } from './field'

/** The fields of `.fields({ ... })` by name; `null` ignores a column on purpose. */
export type FieldsInput = Record<string, AnyField | null>

export type ActiveFields<F> = { [K in keyof F as F[K] extends null ? never : K]: F[K] }

/** A field picked in a builder's callback, such as `r.status`: its name, typed with its value. */
export type Ref<N extends string = string, V = unknown> = {
  /** The field's name. */
  readonly name: N
  /** The field's value type, for the compiler only; never set. */
  readonly $value?: V
}

/** A reference per field of `F`, by name. */
export type Refs<F> = {
  readonly [K in keyof F & string]: F[K] extends Field<infer V> ? Ref<K, V> : never
}

/** The `r` of a builder's callback: a reference per field of `F`, the ignored (`null`) ones left out. */
export type FieldRefs<F> = Refs<ActiveFields<F>>

const refMark = Symbol('protobase.ref')

/** A field reference as a view builder hands it out (`r.status`), recognisable wherever it is passed, props included. */
export const ref = (name: string): Ref => Object.defineProperty({ name }, refMark, { value: true })

export const isRef = (value: unknown): value is Ref => typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[refMark] === true

// Records the accessed field name; with `known`, unknown names throw at runtime.
export const createRefs = <R>(make: (name: string) => unknown, known?: readonly string[]) =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (typeof name === 'symbol') return undefined
        if (known && !known.includes(name)) throw new Error(`Unknown field "${name}"`)
        return make(name)
      },
    },
  ) as R

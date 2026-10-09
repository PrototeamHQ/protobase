import type { AnyField, Field } from './field'

export type FieldsInput = Record<string, AnyField | null>

export type ActiveFields<F> = { [K in keyof F as F[K] extends null ? never : K]: F[K] }

export type Ref<N extends string = string, V = unknown> = {
  readonly name: N
  readonly $value?: V
}

export type Refs<F> = {
  readonly [K in keyof F & string]: F[K] extends Field<infer V> ? Ref<K, V> : never
}

export type FieldRefs<F> = Refs<ActiveFields<F>>

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

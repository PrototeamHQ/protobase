/** The type of {@link encrypted}: what app code gets in place of a set encrypted field's stored value. */
export type Encrypted = {
  /** Reading the value as text throws: only whether the field is set can be read. */
  readonly [Symbol.toPrimitive]: () => never
}

/**
 * What record rules, validators and write hooks get in place of an `.encrypted()` field's stored value when it is set;
 * an empty one is `null`. It is the same for every value and carries nothing of it: test it with `== null` or
 * `=== encrypted`, while comparing it loosely or reading it as text throws. See
 * [Encrypted fields](website/src/content/docs/reference/data-config.mdx#encrypted-fields).
 */
export const encrypted: Encrypted = Object.freeze(
  Object.create(null, {
    [Symbol.toPrimitive]: {
      value: () => {
        throw new TypeError("An encrypted field's stored value cannot be read, only whether it is set")
      },
    },
  }),
)

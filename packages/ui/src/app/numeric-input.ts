import type { FieldType } from '@protobase/schema'

/** Field types whose values are numbers: right-aligned, with a number keyboard on phones. */
export const numeric = new Set<FieldType>(['integer', 'bigint', 'decimal'])

/** The keyboard a phone shows for a field: a number pad for whole numbers, one with a decimal key for decimals. Enter saves or does nothing, hence `done`. */
export const numericInputProps = (type: FieldType) => {
  if (type === 'integer' || type === 'bigint') return { inputMode: 'numeric', enterKeyHint: 'done' } as const
  if (type === 'decimal') return { inputMode: 'decimal', enterKeyHint: 'done' } as const
  return {}
}

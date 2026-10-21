import type { FieldModel } from '@protobase/schema'
import { Sealed } from './envelope-seal'

/**
 * The value a record write sends for `field`: JSON as text, and for an encrypted field only `null` or a value `sealValues`
 * sealed, so no write path stores plaintext in it.
 */
export const storedValue = (field: FieldModel, value: unknown) => {
  if (field.encrypted) {
    if (value === null) return null
    if (value instanceof Sealed) return Sealed.textOf(value)
    throw new Error(`"${field.name}" is encrypted, and its value was not sealed`)
  }
  return field.type === 'json' && value !== null ? JSON.stringify(value) : value
}

import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { differs } from '../../live/field-values'

// A relation picker hands out the record it chose with its label; its draft is the key
const draftOf = (next: unknown) => (typeof next === 'object' && next !== null && 'key' in next ? next.key : next)

/**
 * Whether a change to a field with `.confirm()` asks first: when it moves the value away from the stored one while the
 * value on screen is still that one, so a text asks at its first key and not at every one after.
 */
export const asksToConfirm = (field: FieldModel, hints: FieldViewModel | undefined, value: unknown, stored: unknown, next: unknown) =>
  hints?.confirm !== undefined && !differs(field, value, stored) && differs(field, draftOf(next), stored)

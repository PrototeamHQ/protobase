import { encrypted, type ResourceModel } from '@protobase/schema'
import type { Row } from '../types'

/**
 * A stored row as app code gets it: each encrypted field that holds a value as `encrypted`, never the ciphertext, so
 * rules, validators and hooks know whether it is set and nothing else. An empty one stays `null`.
 */
export const maskEncrypted = (model: ResourceModel, row: Row): Row => {
  const masked = Object.values(model.fields).filter((field) => field.encrypted && row[field.name] != null)
  if (masked.length === 0) return row
  return { ...row, ...Object.fromEntries(masked.map((field) => [field.name, encrypted])) }
}

import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { Row } from '../types'
import type { Binding } from './binding'
import { sealText } from './envelope-seal'
import type { EncryptionRuntime } from './runtime'

const encryptedIn = (model: ResourceModel, values: Row) =>
  Object.keys(values).flatMap((name) => {
    const field = model.fields[name]
    return field?.encrypted && values[name] !== null ? [field] : []
  })

/** Whether `values` set an encrypted field to a value. */
export const hasEncryptedValues = (model: ResourceModel, values: Row) => encryptedIn(model, values).length > 0

/** The encrypted fields of `values` that hold a value. */
export const encryptedValuesOf = (model: ResourceModel, values: Row): Row =>
  Object.fromEntries(encryptedIn(model, values).map((field) => [field.name, values[field.name]]))

/**
 * `values` with each encrypted field's value sealed under `binding(field)`. What was given is always sealed, even text
 * that looks like an envelope, so a client cannot store another record's ciphertext as its own.
 */
export const sealValues = (runtime: EncryptionRuntime | undefined, model: ResourceModel, values: Row, binding: (field: FieldModel) => Binding): Row => {
  const fields = encryptedIn(model, values)
  if (fields.length === 0) return values
  if (!runtime) throw new Error(`"${model.name}" has encrypted fields but no encryption runtime`)
  const sealed = fields.map((field) => {
    const value = values[field.name]
    if (typeof value !== 'string') throw new Error(`"${field.name}" is encrypted and takes text only`)
    return [field.name, sealText(runtime.keyring.current, binding(field), value)]
  })
  return { ...values, ...Object.fromEntries(sealed) }
}

import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { fetchRecord } from '../records'
import { readTransaction } from '../transactions'
import type { FieldRevealedEvent } from '../types'
import { bindingOf } from './binding'
import type { FieldDecrypter, FieldReader } from './decrypt-field-types'
import { openText } from './envelope-open'

const eventOf = (reader: FieldReader, base: Omit<FieldRevealedEvent, 'origin' | 'actor' | 'reader'>): FieldRevealedEvent => {
  if ('job' in reader) return { ...base, reader: { job: reader.job }, origin: {} }
  return { ...base, actor: reader.actor, reader: { function: reader.function }, origin: reader.origin }
}

/**
 * The read `decryptField` of a job's and a protected function's context: privileged like their `db`, so no access rules
 * or tenant scope, of a live (not soft-deleted) record. It opens the value as the reveal does, then publishes a
 * `field.revealed` event naming the reader, and only returns the value once that is accepted: when publishing fails,
 * so does the read.
 */
export const fieldDecrypter = (deps: Deps): FieldDecrypter => (reader) => async (resource, key, field) => {
  const entry = deps.registry.find(resource)
  if (!entry) throw new Error(`Unknown resource "${resource}"`)
  const { model } = entry
  const target = Object.hasOwn(model.fields, field) ? model.fields[field]! : undefined
  if (!target?.encrypted) throw new Error(`"${resource}.${field}" is not an encrypted field`)
  if (!deps.encryption) throw new Error(`"${resource}" has encrypted fields but no encryption runtime`)
  const parts = Array.isArray(key) ? (key as readonly (string | number)[]) : [key as string | number]
  if (parts.length !== model.primaryKey.length) throw new Error(`A ${resource} key has ${model.primaryKey.length} parts, not ${parts.length}`)

  // The binding reads the key and the tenant, as the reveal does.
  const tenantField = model.tenant && !model.primaryKey.includes(model.tenant) ? [model.tenant] : []
  const fields = [...model.primaryKey, ...tenantField, field].map((name) => model.fields[name]!)
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchRecord(trx, entry, parts, undefined, { deleted: 'hide', fields }))
  if (!found) throw new Error(`No ${resource} with key "${encodeKey(parts)}"`)
  const stored = found.record[field] ?? null
  const value = stored === null ? null : openText(deps.encryption.keyring, bindingOf(model, target, found.record), String(stored), { resource, field })

  const tenant = model.tenant ? found.record[model.tenant] : undefined
  await deps.audit.publish(eventOf(reader, {
    type: 'field.revealed',
    at: new Date().toISOString(),
    ...(tenant !== undefined && tenant !== null && { tenant: tenant as string | number }),
    resource,
    recordKey: encodeKey(parts),
    field,
  }))
  return value
}

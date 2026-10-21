import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { FieldModel } from '@protobase/schema'
import type { Entry } from '../registry'
import { columnId, tableId } from '../sql-parts'
import { bindingOf } from './binding'
import { cascadingKeys, type CascadingKey } from './cascading-keys'
import { openText, UnreadableValue, type UnreadableKind } from './envelope-open'
import { envelopePrefix } from './envelope-seal'
import type { Keyring } from './keyring'
import { historyRemnants, outboxRemnants } from './remnants'
import { scanColumn, type ScannedRow } from './scan'

/** A stored value that does not open, by its record's key: never the value. */
export type UnreadableEntry = { key: string[]; kid?: string; kind: UnreadableKind }

/** What an encrypted field's column holds, and where its old plaintext remains. */
export type FieldStatus = {
  resource: string
  field: string
  /** The values that open, by the id of the key they are under. */
  byKey: Record<string, number>
  plaintext: number
  unreadable: UnreadableEntry[]
  /** History rows and undispatched changes that still hold the field from before it was encrypted. */
  history: number
  outbox: number
}

/** Envelopes in a text field that is not encrypted, such as one whose `.encrypted()` was removed. */
export type StrayValues = { resource: string; field: string; count: number }

export type EncryptionStatus = { kid: string; fields: FieldStatus[]; stray: StrayValues[]; cascading: CascadingKey[] }

export const encryptedFields = (entry: Entry) => Object.values(entry.model.fields).filter((field) => field.encrypted)

/** Opens one scanned value: its plaintext and key id, or why it does not open. A value that is no envelope is plaintext. */
export const examine = (keyring: Keyring, entry: Entry, field: FieldModel, row: ScannedRow, binding = bindingOf(entry.model, field, row.record)) => {
  if (!row.stored.startsWith(envelopePrefix)) return { kind: 'plaintext' as const }
  try {
    return { kind: 'open' as const, plaintext: openText(keyring, binding, row.stored, { resource: entry.name, field: field.name }), kid: row.stored.split(':')[2]! }
  } catch (error) {
    if (!(error instanceof UnreadableValue)) throw error
    return { kind: 'unreadable' as const, entry: { key: entry.model.primaryKey.map((name) => String(row.record[name])), ...(error.kid && { kid: error.kid }), kind: error.kind } }
  }
}

const fieldStatus = async (db: Db, entry: Entry, field: FieldModel, keyring: Keyring, changesSchema: string): Promise<FieldStatus> => {
  const status: FieldStatus = { resource: entry.name, field: field.name, byKey: {}, plaintext: 0, unreadable: [], history: 0, outbox: 0 }
  await scanColumn(db, entry, field, async (rows) => {
    for (const row of rows) {
      const found = examine(keyring, entry, field, row)
      if (found.kind === 'plaintext') status.plaintext++
      else if (found.kind === 'open') status.byKey[found.kid] = (status.byKey[found.kid] ?? 0) + 1
      else status.unreadable.push(found.entry)
    }
  })
  status.history = await historyRemnants(db, changesSchema, entry.model, field)
  status.outbox = await outboxRemnants(db, changesSchema, entry.model, field)
  return status
}

const strayValues = async (db: Db, entry: Entry): Promise<StrayValues[]> => {
  const fields = Object.values(entry.model.fields).filter((field) => field.type === 'text' && !field.encrypted)
  const stray: StrayValues[] = []
  for (const field of fields) {
    const { rows } = await sql<{ count: string }>`select count(*)::text as count from ${tableId(entry.model)} where ${columnId(field)} like ${`${envelopePrefix}%`}`.execute(db)
    const count = Number(rows[0]!.count)
    if (count > 0) stray.push({ resource: entry.name, field: field.name, count })
  }
  return stray
}

/**
 * Per encrypted field: the values by key, the plaintext ones, those that do not open, and the old plaintext left in the
 * history and the outbox; envelopes in fields that are not encrypted; foreign keys that rewrite a key. It writes nothing.
 */
export const encryptionStatus = async (db: Db, entries: readonly Entry[], keyring: Keyring, changesSchema: string): Promise<EncryptionStatus> => {
  const fields: FieldStatus[] = []
  const stray: StrayValues[] = []
  const cascading: CascadingKey[] = []
  for (const entry of entries) {
    for (const field of encryptedFields(entry)) fields.push(await fieldStatus(db, entry, field, keyring, changesSchema))
    stray.push(...(await strayValues(db, entry)))
    if (encryptedFields(entry).length > 0) cascading.push(...(await cascadingKeys(db, entry.model)))
  }
  return { kid: keyring.current.id, fields, stray, cascading }
}

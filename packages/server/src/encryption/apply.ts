import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { FieldModel } from '@protobase/schema'
import type { Entry } from '../registry'
import { columnId, tableId } from '../sql-parts'
import { bindingOf, movedBinding } from './binding'
import { cascadingKeys, type CascadingKey } from './cascading-keys'
import { captureOff } from './capture-off'
import { Sealed, sealText } from './envelope-seal'
import type { Keyring } from './keyring'
import { scrubHistory, scrubOutbox } from './remnants'
import { scanColumn, type RowAddress, type ScannedRow } from './scan'
import { encryptedFields, examine, type UnreadableEntry } from './status'

/** Values sealed under another table (as `.table()` wrote it) or column, before a rename: of one field, or every one of the resource. */
export type RebindOption = { resource: string; field?: string; from: { table?: string; column?: string } }

export type ApplyOptions = { rebind?: RebindOption }

/** What `apply` did to one encrypted field. */
export type FieldApplied = {
  resource: string
  field: string
  /** Plaintext values it encrypted. */
  encrypted: number
  /** Values under a previous key it encrypted with the current one. */
  reencrypted: number
  /** Values that opened only where they were before a rename, sealed again where they are now. */
  rebound: number
  /** Values a write changed while it ran, which it left alone. */
  skipped: number
  unreadable: UnreadableEntry[]
  /** History rows and undispatched changes it removed the field's old values from. */
  historyScrubbed: number
  outboxScrubbed: number
}

export type ApplyResult = { kid: string; fields: FieldApplied[]; warnings: CascadingKey[] }

type Change = { address: RowAddress; old: string; value: string; count: keyof Pick<FieldApplied, 'encrypted' | 'reencrypted' | 'rebound'> }

const rebindsField = (rebind: RebindOption | undefined, entry: Entry, field: FieldModel) =>
  rebind !== undefined && rebind.resource === entry.name && (rebind.field === undefined || rebind.field === field.name) ? rebind : undefined

// The new value of one row, or the reason it keeps its old one.
const changeOf = (keyring: Keyring, entry: Entry, field: FieldModel, row: ScannedRow, rebind: RebindOption | undefined): Change | UnreadableEntry | undefined => {
  const binding = bindingOf(entry.model, field, row.record)
  const seal = (plaintext: string, count: Change['count']): Change => ({ address: row.address, old: row.stored, value: Sealed.textOf(sealText(keyring.current, binding, plaintext)), count })
  const found = examine(keyring, entry, field, row, binding)
  if (found.kind === 'plaintext') return seal(row.stored, 'encrypted')
  if (found.kind === 'open') return found.kid === keyring.current.id ? undefined : seal(found.plaintext, 'reencrypted')
  if (found.entry.kind !== 'failed-authentication' || !rebind) return found.entry
  const moved = examine(keyring, entry, field, row, movedBinding(binding, rebind.from))
  return moved.kind === 'open' ? seal(moved.plaintext, 'rebound') : found.entry
}

// Finds the row again by the database's own text of its key and tenant, and only while it still holds what was read.
const write = async (trx: Db, entry: Entry, field: FieldModel, change: Change) => {
  const { model } = entry
  const keys = model.primaryKey.map((name, i) => sql`${columnId(model.fields[name]!)} = ${change.address.key[i]!}`)
  const tenant = model.tenant ? [sql`${columnId(model.fields[model.tenant]!)} is not distinct from ${change.address.tenant}`] : []
  const conditions = sql.join([...keys, ...tenant, sql`${columnId(field)} = ${change.old}`], sql` and `)
  const result = await sql`update ${tableId(model)} set ${columnId(field)} = ${change.value} where ${conditions}`.execute(trx)
  return Number(result.numAffectedRows ?? 0n) > 0
}

const applyField = async (db: Db, entry: Entry, field: FieldModel, keyring: Keyring, changesSchema: string, rebind: RebindOption | undefined): Promise<FieldApplied> => {
  const applied: FieldApplied = { resource: entry.name, field: field.name, encrypted: 0, reencrypted: 0, rebound: 0, skipped: 0, unreadable: [], historyScrubbed: 0, outboxScrubbed: 0 }
  await scanColumn(db, entry, field, async (rows, connection) => {
    const changes: Change[] = []
    for (const row of rows) {
      const change = changeOf(keyring, entry, field, row, rebind)
      if (change && 'address' in change) changes.push(change)
      else if (change) applied.unreadable.push(change)
    }
    if (changes.length === 0) return
    await captureOff(connection, changesSchema, async (trx) => {
      for (const change of changes) {
        if (await write(trx, entry, field, change)) applied[change.count]++
        else applied.skipped++
      }
    })
  })
  applied.historyScrubbed = await scrubHistory(db, changesSchema, entry.model, field)
  applied.outboxScrubbed = await scrubOutbox(db, changesSchema, entry.model, field)
  return applied
}

// Envelopes of the column under key ids, without opening them: a column whose envelopes are all under keys this run
// lacks shows a run with another key than the app's, which would seal its plaintext under a key the app cannot open.
const keyIdsOf = async (db: Db, entry: Entry, field: FieldModel) => {
  const { rows } = await sql<{ kid: string }>`select distinct split_part(${columnId(field)}, ':', 3) as kid from ${tableId(entry.model)} where ${columnId(field)} like 'pbenc:%'`.execute(db)
  return rows.map(({ kid }) => kid)
}

const checkKeys = async (db: Db, entries: readonly Entry[], keyring: Keyring) => {
  for (const entry of entries) {
    for (const field of encryptedFields(entry)) {
      const kids = await keyIdsOf(db, entry, field)
      if (kids.length > 0 && !kids.some((kid) => keyring.byId.has(kid))) {
        throw new Error(`${entry.name}.${field.name} holds values under keys ${kids.join(', ')} only, none of which this run has (key ${keyring.current.id}): run with the keys the app serves with`)
      }
    }
  }
}

/**
 * Brings every encrypted field's column to the current key: plaintext values are encrypted, values under a previous key
 * encrypted again, and with `rebind` values sealed where they were before a rename sealed where they are now. Values that
 * do not open are listed and left alone. Then the fields' old values are removed from the history and the changes not
 * yet dispatched. Its writes capture no change. It refuses to run when a column holds envelopes under none of its keys.
 */
export const applyEncryption = async (db: Db, entries: readonly Entry[], keyring: Keyring, changesSchema: string, options: ApplyOptions = {}): Promise<ApplyResult> => {
  await checkKeys(db, entries, keyring)
  const fields: FieldApplied[] = []
  const warnings: CascadingKey[] = []
  for (const entry of entries) {
    for (const field of encryptedFields(entry)) fields.push(await applyField(db, entry, field, keyring, changesSchema, rebindsField(options.rebind, entry, field)))
    if (encryptedFields(entry).length > 0) warnings.push(...(await cascadingKeys(db, entry.model)))
  }
  return { kid: keyring.current.id, fields, warnings }
}

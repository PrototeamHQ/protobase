import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { CleanupSchedule } from './cleanup-schedule'
import type { FileProvider } from './store'

/** A column that holds file values, read without any resource's filters: soft-deleted rows still reference their files. */
export type FileColumn = { table: ResourceModel['table']; column: string }

/** Every declared file column, once per table and column even when two resources share them. */
export const fileColumns = (models: ResourceModel[]): FileColumn[] => {
  const seen = new Map<string, FileColumn>()
  for (const model of models) {
    for (const field of Object.values(model.fields)) {
      if (field.type !== 'file') continue
      seen.set(JSON.stringify([model.table.schema ?? '', model.table.name, field.column]), { table: model.table, column: field.column })
    }
  }
  return [...seen.values()]
}

const chunk = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

/** The identities (`provider:path`) among `uris` that some row still holds. */
const referenced = async (db: Db, columns: FileColumn[], uris: string[]) => {
  const found = new Set<string>()
  for (const { table, column } of columns) {
    const value = sql`split_part(${sql.id(column)}, '?', 1)`
    const name = table.schema ? sql.id(table.schema, table.name) : sql.id(table.name)
    const rows = await sql<{ uri: string }>`select distinct ${value} as uri from ${name} where ${value} = any(${uris})`.execute(db)
    for (const row of rows.rows) found.add(row.uri)
  }
  return found
}

export type CleanupInput = { db: Db; columns: FileColumn[]; providers: Record<string, FileProvider>; schedule: CleanupSchedule; now?: Date }

export type CleanupReport = { deleted: string[]; kept: string[] }

/**
 * Handles every scheduled delete that is due: right before deleting, it checks that no declared file column holds the
 * file; one that is referenced again (a rolled-back write, a restore, a shared value) is kept and its entry dropped.
 * Uploads never attached are deleted here too, after their ticket expired. Running it twice at once is harmless.
 */
export const runCleanup = async ({ db, columns, providers, schedule, now = new Date() }: CleanupInput): Promise<CleanupReport> => {
  const deleted = new Set<string>()
  const kept = new Set<string>()
  for (const entries of chunk(await schedule.due(now), 500)) {
    const uris = [...new Set(entries.map((entry) => `${entry.provider}:${entry.path}`))]
    const inUse = await referenced(db, columns, uris)
    for (const entry of entries) {
      const uri = `${entry.provider}:${entry.path}`
      if (inUse.has(uri)) kept.add(uri)
      else if (!deleted.has(uri)) {
        await providers[entry.provider]!.store.delete(entry.path)
        deleted.add(uri)
      }
      await schedule.done(entry)
    }
  }
  return { deleted: [...deleted], kept: [...kept] }
}

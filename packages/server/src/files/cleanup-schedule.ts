import type { FileProvider } from './store'

/** A file to delete once `due`, unless a row references it again by then. */
export type ScheduledDelete = { provider: string; path: string; due: Date }

export type CleanupEntry = ScheduledDelete & { id: string }

/**
 * Where scheduled deletes wait. The default keeps them in each provider's own storage (`storageCleanupSchedule`); a
 * table in a schema of its own, written by a migration at update time, can take its place behind the same three calls.
 */
export type CleanupSchedule = {
  add(deletes: ScheduledDelete[]): Promise<void>
  /** Every entry due at `now`. */
  due(now: Date): Promise<CleanupEntry[]>
  /** Drops an entry once it is handled. */
  done(entry: CleanupEntry): Promise<void>
}

export const cleanupFolder = '.cleanup/'

// `2026-10-12T03-00-00Z`: sorts like the time it stands for, and is a valid file name everywhere.
const stamp = (date: Date) => date.toISOString().slice(0, 19).replaceAll(':', '-') + 'Z'

const entryPattern = /^\.cleanup\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)-[0-9a-f-]{36}\.json$/

const isScheduledDelete = (value: unknown): value is { provider: string; path: string; due: string } =>
  typeof value === 'object' && value !== null &&
  typeof (value as { provider?: unknown }).provider === 'string' &&
  typeof (value as { path?: unknown }).path === 'string' &&
  typeof (value as { due?: unknown }).due === 'string'

/**
 * Scheduled deletes as a to-do folder in each provider's storage: one JSON object per delete in `.cleanup/`, named after
 * its due time (`.cleanup/2026-10-12T03-00-00Z-<uuid>.json`) and saying which provider and path to delete.
 */
export const storageCleanupSchedule = (providers: Record<string, FileProvider>): CleanupSchedule => {
  const storeOf = (provider: string) => {
    const found = providers[provider]
    if (!found) throw new Error(`No file provider "${provider}" is configured`)
    return found.store
  }

  return {
    add: async (deletes) => {
      for (const { provider, path, due } of deletes) {
        const body = new Blob([JSON.stringify({ provider, path, due: due.toISOString() })]).stream()
        await storeOf(provider).put(`${cleanupFolder}${stamp(due)}-${crypto.randomUUID()}.json`, body)
      }
    },
    due: async (now) => {
      const entries: CleanupEntry[] = []
      for (const [provider, { store }] of Object.entries(providers)) {
        for (const object of await store.list(cleanupFolder)) {
          const match = entryPattern.exec(object.path)
          if (!match) throw new Error(`"${object.path}" in file provider "${provider}" is not a scheduled delete; remove it`)
          if (match[1]! > stamp(now)) continue
          const content: unknown = JSON.parse(await new Response(await store.read(object.path)).text())
          if (!isScheduledDelete(content) || content.provider !== provider) throw new Error(`"${object.path}" in file provider "${provider}" is not a scheduled delete of it; remove it`)
          entries.push({ id: object.path, provider, path: content.path, due: new Date(content.due) })
        }
      }
      return entries
    },
    done: (entry) => storeOf(entry.provider).delete(entry.id),
  }
}

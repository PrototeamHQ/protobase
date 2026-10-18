import { guarded } from '../lib/guarded'

const prefix = 'protobase:pinned:'

export const pinnedStorageKey = (userId: string, resource: string) => `${prefix}${userId}:${resource}`

export const readPinned = (storage: Pick<Storage, 'getItem'>, key: string): string[] | undefined =>
  guarded(() => {
    const raw = storage.getItem(key)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : undefined
  }, undefined)

/** Keeps an empty list too, so a column pinned by default and then unpinned stays unpinned. */
export const writePinned = (storage: Pick<Storage, 'setItem'>, key: string, pinned: string[]) => guarded(() => storage.setItem(key, JSON.stringify(pinned)), undefined)

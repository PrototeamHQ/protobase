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

export const writePinned = (storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, pinned: string[]) =>
  guarded(() => (pinned.length === 0 ? storage.removeItem(key) : storage.setItem(key, JSON.stringify(pinned))), undefined)

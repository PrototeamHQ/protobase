import { guarded } from '../lib/guarded'

/** What a person had changed on a record but not saved: the field edits and the new order of its lines. */
export type RecordDraft = { etag: string; fields: Record<string, unknown>; order?: string[] }

export const draftStorageKey = (userId: string, resource: string, recordKey: string) => `protobase:draft:${userId}:${resource}:${recordKey}`

/** The saved draft, only if it was made against the version of the record that is on screen now. */
export const readDraft = (storage: Pick<Storage, 'getItem'>, key: string, etag: string): RecordDraft | undefined =>
  guarded(() => {
    const raw = storage.getItem(key)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as Partial<RecordDraft> | null
    if (!parsed || parsed.etag !== etag || typeof parsed.fields !== 'object' || parsed.fields === null) return undefined
    return { etag, fields: parsed.fields, ...(Array.isArray(parsed.order) && { order: parsed.order.map(String) }) }
  }, undefined)

export const writeDraft = (storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, draft: RecordDraft | undefined) =>
  guarded(() => (draft ? storage.setItem(key, JSON.stringify(draft)) : storage.removeItem(key)), undefined)

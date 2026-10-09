import { describe, expect, it } from 'vitest'
import { draftStorageKey, readDraft, writeDraft } from './draft-storage'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

describe('record drafts', () => {
  it('keys by user, resource and record', () => {
    expect(draftStorageKey('u1', 'invoices', '2')).toBe('protobase:draft:u1:invoices:2')
  })

  it('brings back the edits and the new line order', () => {
    const storage = memory()
    writeDraft(storage, 'k', { etag: '"v1"', fields: { status: 'sent' }, order: ['3', '1', '2'] })
    expect(readDraft(storage, 'k', '"v1"')).toEqual({ etag: '"v1"', fields: { status: 'sent' }, order: ['3', '1', '2'] })
  })

  it('drops a draft made against another version of the record', () => {
    const storage = memory()
    writeDraft(storage, 'k', { etag: '"v1"', fields: { status: 'sent' } })
    expect(readDraft(storage, 'k', '"v2"')).toBeUndefined()
  })

  it('forgets a draft when asked to write nothing', () => {
    const storage = memory()
    writeDraft(storage, 'k', { etag: '"v1"', fields: {} })
    writeDraft(storage, 'k', undefined)
    expect(readDraft(storage, 'k', '"v1"')).toBeUndefined()
  })

  it('ignores what it did not write, and unavailable storage', () => {
    const storage = memory()
    storage.setItem('k', 'not json at all'.slice(0, 0) + '[1]')
    expect(readDraft(storage, 'k', '"v1"')).toBeUndefined()
    expect(readDraft({ getItem: () => { throw new DOMException('blocked', 'SecurityError') } }, 'k', '"v1"')).toBeUndefined()
  })
})

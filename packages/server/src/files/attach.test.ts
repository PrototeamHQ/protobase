import { describe, expect, it, vi } from 'vitest'
import type { FilesRuntime } from './runtime'
import { scheduleRemovedFiles } from './attach'

const removed = [{ provider: 'private', path: '1/a.jpg', due: new Date('2026-08-02T00:00:00Z') }]

const filesWith = (add: () => Promise<void>) => ({ schedule: { add, due: vi.fn(), done: vi.fn() } }) as unknown as FilesRuntime

describe('scheduleRemovedFiles', () => {
  it("schedules a committed write's removed files, and nothing when it removed none", async () => {
    const add = vi.fn(async () => {})
    await scheduleRemovedFiles({ files: filesWith(add), report: vi.fn() }, removed)
    await scheduleRemovedFiles({ files: filesWith(add), report: vi.fn() }, [])
    expect(add.mock.calls).toEqual([[removed]])
  })

  it('reports a storage that refuses the entries, since the write it follows stands', async () => {
    const down = new Error('storage unavailable')
    const report = vi.fn()
    await scheduleRemovedFiles({ files: filesWith(() => Promise.reject(down)), report }, removed)
    expect(report).toHaveBeenCalledWith(down)
  })
})

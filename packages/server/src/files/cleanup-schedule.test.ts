import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storageCleanupSchedule } from './cleanup-schedule'
import { localFiles } from './local-files'
import { tempDir } from './testing/temp-dir'

let folder: Awaited<ReturnType<typeof tempDir>>
beforeEach(async () => {
  folder = await tempDir()
})
afterEach(() => folder.remove())

describe('the cleanup to-do folder', () => {
  it('keeps one JSON object per delete in its provider, named after the due time', async () => {
    const providers = { private: localFiles({ dir: `${folder.dir}/private` }), public: localFiles({ dir: `${folder.dir}/public`, public: true }) }
    const schedule = storageCleanupSchedule(providers)
    await schedule.add([
      { provider: 'private', path: 'acme/a.png', due: new Date('2026-10-12T03:00:00Z') },
      { provider: 'public', path: 'acme/b.png', due: new Date('2026-10-11T00:00:00Z') },
      { provider: 'private', path: 'acme/c.png', due: new Date('2026-10-20T00:00:00Z') },
    ])
    const [entry] = await providers.private.store.list('.cleanup/')
    expect(entry!.path).toMatch(/^\.cleanup\/2026-10-12T03-00-00Z-[0-9a-f-]{36}\.json$/)
    expect(JSON.parse(await new Response(await providers.private.store.read(entry!.path)).text())).toEqual({ provider: 'private', path: 'acme/a.png', due: '2026-10-12T03:00:00.000Z' })

    const due = await schedule.due(new Date('2026-10-12T03:00:00Z'))
    expect(due.map(({ provider, path }) => `${provider}:${path}`).sort()).toEqual(['private:acme/a.png', 'public:acme/b.png'])
    for (const found of due) await schedule.done(found)
    expect(await schedule.due(new Date('2026-10-19T00:00:00Z'))).toEqual([])
    expect(await schedule.due(new Date('2026-10-20T00:00:00Z'))).toMatchObject([{ provider: 'private', path: 'acme/c.png' }])
  })

  it('stops at a file in the folder it did not write', async () => {
    const providers = { private: localFiles({ dir: folder.dir }) }
    await providers.private.store.put('.cleanup/notes.txt', new Blob(['x']).stream())
    await expect(storageCleanupSchedule(providers).due(new Date())).rejects.toThrow('".cleanup/notes.txt" in file provider "private" is not a scheduled delete')
  })
})

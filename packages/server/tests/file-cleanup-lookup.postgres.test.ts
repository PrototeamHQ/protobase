import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Kysely } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tableIndexes, uncoveredFileColumns } from '@protobase/query'
import { fileColumns, runCleanup } from '../src/files/cleanup-runner'
import { storageCleanupSchedule } from '../src/files/cleanup-schedule'
import { localFiles } from '../src/files/local-files'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { field, model } from '../../../test-support/query'
import { seqScansOf, watchStatements } from '../../../test-support/query-plans'

// Before it deletes a file, the cleanup checks that no row of a file column holds it, among as many rows as a busy
// table holds: by the index the doctor suggests for the column. Plans a recording cannot make.
vi.setConfig({ testTimeout: 60_000 })

const ready = await postgresTemplateReady('empty')

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const photos = model('photos', ['id'], [field('id', 'integer'), field('photo', 'file', { nullable: true })])

const body = () => new Blob(['bytes']).stream()

describe.skipIf(!ready)('the file cleanup among 200,000 rows', () => {
  it('keeps a file a row holds and deletes the others, looking each up by the index the doctor suggests', async () => {
    const store = await openPostgresDatabase('empty')
    await store.exec(`create table photos (id integer primary key, photo text);
      insert into photos select i, 'local:photos/' || i || '.jpg?w=100' from generate_series(1, 200000) i;
      analyze`)
    const [needed] = uncoveredFileColumns(photos, await tableIndexes(store.db, photos))
    expect(needed?.suggestion).toBe(`create index on "photos" ((split_part("photo", '?', 1)))`)
    await store.exec(`${needed!.suggestion}; analyze`)
    expect(uncoveredFileColumns(photos, await tableIndexes(store.db, photos))).toEqual([])

    const dir = mkdtempSync(path.join(tmpdir(), 'file-cleanup-'))
    dirs.push(dir)
    const providers = { local: localFiles({ dir }) }
    await providers.local.store.put('photos/5.jpg', body())
    await providers.local.store.put('photos/gone.jpg', body())
    const schedule = storageCleanupSchedule(providers)
    const due = new Date('2026-07-01T00:00:00Z')
    await schedule.add([{ provider: 'local', path: 'photos/5.jpg', due }, { provider: 'local', path: 'photos/gone.jpg', due }])

    const watched = watchStatements(store)
    const report = await runCleanup({ db: new Kysely<any>({ dialect: watched.dialect }), columns: fileColumns([photos]), providers, schedule, now: new Date('2026-07-02T00:00:00Z') })
    expect(report).toEqual({ deleted: ['local:photos/gone.jpg'], kept: ['local:photos/5.jpg'] })
    expect(await providers.local.store.head('photos/gone.jpg')).toBeUndefined()
    const plans = await watched.plansOf('photos')
    expect(seqScansOf(plans, 'photos')).toEqual([])
    expect(plans).toHaveLength(1)
  })
})

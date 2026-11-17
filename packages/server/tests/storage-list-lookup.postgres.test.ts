import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { listFolder, type ListQuery } from '../src/storage/list-sql'
import { asCaller } from '../src/storage/storage-db'
import { storageUsers } from '../../../test-support/fixtures/storage-ddl'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { seqScansOf, watchStatements } from '../../../test-support/query-plans'

// A folder level of a bucket as big as a busy app's, listed as a signed-in person under the bucket's policies: walked
// entry by entry on the index, never by reading every object below the folder. Too many rows for a recording to hold.
vi.setConfig({ testTimeout: 120_000 })

const ready = await postgresTemplateReady('storage')

const { alice, bob } = storageUsers

const query = (prefix: string, more: Partial<ListQuery> = {}): ListQuery => ({ prefix, search: '', limit: 100, offset: 0, column: 'name', order: 'asc', ...more })

describe.skipIf(!ready)('listing a folder among 400,000 objects', () => {
  it('lists the entries of a level, folders once each, as the policies let the caller see them', async () => {
    const store = await openPostgresDatabase('storage')
    // Alice's 60 folders of 5,000 documents and 20 beside them, and as many of Bob's.
    await store.exec(`insert into storage.objects (bucket_id, name, owner_id)
        select 'documents', '${alice}/folder-' || lpad(f::text, 2, '0') || '/' || n || '.txt', '${alice}' from generate_series(1, 60) f, generate_series(1, 5000) n;
      insert into storage.objects (bucket_id, name, owner_id) select 'documents', '${alice}/file-' || lpad(n::text, 2, '0') || '.txt', '${alice}' from generate_series(1, 20) n;
      insert into storage.objects (bucket_id, name, owner_id) select 'documents', '${bob}/' || n || '.txt', '${bob}' from generate_series(1, 100000) n;
      analyze`)
    const watched = watchStatements(store)
    const deps = { db: new Kysely<any>({ dialect: watched.dialect }), statementTimeoutMs: 30_000 }
    const list = (listed: ListQuery) => asCaller(deps, { role: 'authenticated', claims: { sub: alice, role: 'authenticated' } }, true, (trx) => listFolder(trx, 'documents', listed))

    expect((await list(query(''))).map((entry) => [entry.name, entry.id === null])).toEqual([[alice, true]])
    const level = await list(query(`${alice}/`))
    expect(level.map((entry) => entry.name)).toEqual([
      ...Array.from({ length: 20 }, (_, i) => `file-${String(i + 1).padStart(2, '0')}.txt`),
      ...Array.from({ length: 60 }, (_, i) => `folder-${String(i + 1).padStart(2, '0')}`),
    ])
    expect(level.filter((entry) => entry.id === null)).toHaveLength(60)
    expect((await list(query(`${alice}/`, { search: 'FOLDER-0', limit: 3, offset: 2 }))).map((entry) => entry.name)).toEqual(['folder-03', 'folder-04', 'folder-05'])

    const plans = await watched.plansOf('objects')
    expect(plans).toHaveLength(3)
    expect(seqScansOf(plans, 'objects')).toEqual([])
  })
})

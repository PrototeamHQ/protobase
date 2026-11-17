import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { listFolder, type ListQuery } from '../src/storage/list-sql'
import { asCaller } from '../src/storage/storage-db'
import { storageUsers } from '../../../test-support/fixtures/storage-ddl'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { largeTable, seqScansOf, watchStatements } from '../../../test-support/query-plans'

// A folder level of a bucket as big as a busy app's, listed as a signed-in person under the bucket's policies: walked
// entry by entry on the index, never by reading every object below the folder. Too many rows for a recording to hold.
vi.setConfig({ testTimeout: 120_000 })

const ready = await postgresTemplateReady('storage')

const { alice, bob } = storageUsers

const query = (prefix: string, more: Partial<ListQuery> = {}): ListQuery => ({ prefix, search: '', limit: 100, offset: 0, column: 'name', order: 'asc', ...more })

describe.skipIf(!ready)('listing a folder among 400,000 objects', () => {
  it('lists the entries of a level, folders once each, as the policies let the caller see them', async () => {
    const store = await openPostgresDatabase('storage')
    // Alice's 60 folders of 5,000 documents and 20 beside them, a flat folder of 5,000 with one folder among them, and
    // Bob's 100,000.
    await store.exec(`${largeTable('storage.objects', ['bucket_id', 'name'])};
      insert into storage.objects (bucket_id, name, owner_id)
        select 'documents', '${alice}/folder-' || lpad(f::text, 2, '0') || '/' || n || '.txt', '${alice}' from generate_series(1, 60) f, generate_series(1, 5000) n;
      insert into storage.objects (bucket_id, name, owner_id) select 'documents', '${alice}/file-' || lpad(n::text, 2, '0') || '.txt', '${alice}' from generate_series(1, 20) n;
      insert into storage.objects (bucket_id, name, owner_id) select 'documents', '${alice}/flat/' || lpad(n::text, 5, '0') || '.txt', '${alice}' from generate_series(1, 5000) n;
      insert into storage.objects (bucket_id, name, owner_id) values ('documents', '${alice}/flat/02500.txt-notes/a.txt', '${alice}');
      insert into storage.objects (bucket_id, name, owner_id) select 'documents', '${bob}/' || n || '.txt', '${bob}' from generate_series(1, 100000) n;
      analyze`)
    const watched = watchStatements(store)
    const deps = { db: new Kysely<any>({ dialect: watched.dialect }), statementTimeoutMs: 30_000 }
    const list = (listed: ListQuery) => asCaller(deps, { role: 'authenticated', claims: { sub: alice, role: 'authenticated' } }, true, (trx) => listFolder(trx, 'documents', listed))

    expect((await list(query(''))).map((entry) => [entry.name, entry.id === null])).toEqual([[alice, true]])
    const level = await list(query(`${alice}/`))
    expect(level.map((entry) => entry.name)).toEqual([
      ...Array.from({ length: 20 }, (_, i) => `file-${String(i + 1).padStart(2, '0')}.txt`),
      'flat',
      ...Array.from({ length: 60 }, (_, i) => `folder-${String(i + 1).padStart(2, '0')}`),
    ])
    expect(level.filter((entry) => entry.id === null)).toHaveLength(61)
    // Read in batches of up to 1,000 objects, the one after the folder among them a batch of one again.
    const flat = await list(query(`${alice}/flat/`, { limit: 10_000 }))
    expect(flat).toHaveLength(5001)
    expect(flat.slice(2499, 2502).map((entry) => [entry.name, entry.id === null])).toEqual([['02500.txt', false], ['02500.txt-notes', true], ['02501.txt', false]])
    expect((await list(query(`${alice}/flat/`, { offset: 4998, limit: 5 }))).map((entry) => entry.name)).toEqual(['04998.txt', '04999.txt', '05000.txt'])
    expect((await list(query(`${alice}/`, { search: 'FOLDER-0', limit: 3, offset: 2 }))).map((entry) => entry.name)).toEqual(['folder-03', 'folder-04', 'folder-05'])

    const plans = await watched.plansOf('objects')
    expect(plans).toHaveLength(5)
    expect(seqScansOf(plans, 'objects')).toEqual([])
  })
})

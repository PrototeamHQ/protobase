import { describe, expect, it, vi } from 'vitest'
import { tableFeed } from '../src/live/notice-feed'
import { noticesTableSql } from '../src/live/notices-sql'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// A page that reconnects replays the notices it missed, up to where its new subscription starts, from the notices
// table on real Postgres, with thousands of notices after that point.
vi.setConfig({ testTimeout: 30_000 })

describe.skipIf(!(await postgresTemplateReady('empty')))('the notices a page replays', () => {
  it('are those after its last one up to the cursor, none past it, or none at all when more than the limit or pruned', async () => {
    const store = await openPostgresDatabase('empty')
    await store.exec(`create schema events; ${noticesTableSql('events')};
      insert into events.notices (resource, record_key, operation) select 'tasks', i::text, 'update' from generate_series(1, 10000) i`)
    const feed = tableFeed({ db: store.db, schema: 'events', report: (error) => { throw error } })
    const keys = (notices: { key: string }[] | undefined) => notices?.map((notice) => notice.key)
    expect(keys(await feed.replay('10', '13', 3))).toEqual(['11', '12', '13'])
    expect(await feed.replay('10', '14', 3)).toBeUndefined()
    expect(await feed.replay('13', '13', 3)).toEqual([])
    await store.exec('delete from events.notices where id = 10')
    expect(await feed.replay('10', '13', 3)).toBeUndefined()
    await store.close()
  })
})

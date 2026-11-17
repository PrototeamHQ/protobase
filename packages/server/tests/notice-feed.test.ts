import { describe, expect, it } from 'vitest'
import { tableFeed } from '../src/live/notice-feed'
import { noticesTableSql } from '../src/live/notices-sql'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// A page that reconnects replays the notices it missed, up to where its new subscription starts, from the notices
// table, with more notices after that point.
describe('the notices a page replays', () => {
  it('are those after its last one up to the cursor, none past it, or none at all when more than the limit or pruned', async () => {
    const store = await openSnapshotDb('empty')
    await store.exec(`create schema events; ${noticesTableSql('events')};
      insert into events.notices (resource, record_key, operation) select 'tasks', i::text, 'update' from generate_series(1, 20) i`)
    const feed = tableFeed({ db: store.db, schema: 'events', report: (error) => { throw error } })
    const keys = (notices: { key: string }[] | undefined) => notices?.map((notice) => notice.key)
    expect(keys(await feed.replay('10', '13', 3))).toEqual(['11', '12', '13'])
    expect(await feed.replay('10', '14', 3)).toBeUndefined()
    expect(await feed.replay('13', '13', 3)).toEqual([])
    await store.exec('delete from events.notices where id = 10')
    expect(await feed.replay('10', '13', 3)).toBeUndefined()
  })
})

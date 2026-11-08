import { Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const lines = resource('lines')
  .table('lines')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    folderId: f.integer().filterable(),
    position: f.integer().sortable(),
    body: f.text(),
  })
  .primaryKey((r) => r.id)

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`create table lines (id integer generated always as identity primary key, folder_id integer not null, position integer not null, body text not null,
    unique (folder_id, position)); create index on lines (folder_id, position); create index on lines (position);`)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [lines], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

beforeEach(async () => {
  await pg.exec(`truncate lines restart identity;
    insert into lines (folder_id, position, body) values (1, 1, 'a'), (1, 2, 'b'), (1, 3, 'c'), (1, 4, 'd'), (2, 1, 'x');`)
})

const move = (key: number, after: number | null, before: number | null) =>
  app.request('/api/v1:batchWrite', {
    method: 'POST',
    headers: { ...as(1, 'admin'), 'content-type': 'application/json' },
    body: JSON.stringify({ ops: [{ op: 'move', resource: 'lines', field: 'position', key, after, before, filter: 'folderId = 1' }] }),
  })
const order = async () => (await pg.query<{ body: string }>('select body from lines where folder_id = 1 order by position')).rows.map((row) => row.body).join('')

describe('the batch move', () => {
  it('saves while the moved record and the records it passes were edited since, and writes only what changes', async () => {
    await pg.exec("update lines set body = upper(body) where id in (2, 4)")
    const response = await move(4, 1, 2)
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.results[0].op).toBe('move')
    expect(body.results[0].records.map((entry: { record: { id: number; position: number }; previous: number }) => [entry.record.id, entry.record.position, entry.previous])).toEqual([[4, 2, 4], [2, 3, 2], [3, 4, 3]])
    expect(await order()).toBe('aDBc')
    expect((await pg.query<{ position: number }>('select position from lines where folder_id = 2')).rows[0]!.position).toBe(1)
  })

  it('saves while records were added or removed elsewhere in the list', async () => {
    await pg.exec("delete from lines where id = 3; insert into lines (folder_id, position, body) values (1, 9, 'e')")
    // e is id 6, after x
    const response = await move(1, 4, 6)
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await order()).toBe('bdae')
  })

  it('is refused with 412 when another record now follows the anchor, and writes nothing', async () => {
    // Seen as a b c d with d dropped after a; meanwhile c was moved up to just after a
    await pg.exec('update lines set position = 0 where id = 3; update lines set position = 3 where id = 2; update lines set position = 2 where id = 3')
    const response = await move(4, 1, 2)
    expect(response.status).toBe(412)
    expect(await response.json()).toMatchObject({ operation: 0, op: 'move', type: 'urn:protobase:problem:precondition-failed' })
    expect(await order()).toBe('acbd')
    expect((await move(4, 1, 3)).status).toBe(200)
    expect(await order()).toBe('adcb')
  })
})

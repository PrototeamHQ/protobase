import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// A chat message whose sender is whoever posts it.
const messages = resource('messages')
  .table('messages')
  .fields({ id: f.integer().readOnly(), body: f.text(), author_id: f.text() })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec('create table messages (id integer generated always as identity primary key, body text not null, author_id text not null)')
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [messages], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const call = (path: string, init: RequestInit, user = 'ann') =>
  app.request(`/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${signTestToken({ sub: user, roles: ['admin'] })}`, 'content-type': 'application/json', ...(init.headers as Record<string, string>) } })
const post = (path: string, body: unknown, user?: string) => call(path, { method: 'POST', body: JSON.stringify(body) }, user)

describe('a resource with an author', () => {
  it('stamps each create with the signed-in user, through the resources API and a batch', async () => {
    const created = await post('/messages', { body: 'Hi all' })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ body: 'Hi all', author_id: 'ann' })

    const batch = await post(':batchWrite', { ops: [{ op: 'create', resource: 'messages', data: { body: 'Hi Ann' } }] }, 'bo')
    expect(batch.status).toBe(200)
    expect(await batch.json()).toMatchObject({ results: [{ record: { body: 'Hi Ann', author_id: 'bo' } }] })
  })

  it("refuses the client's own value on create and on update", async () => {
    const forged = await post('/messages', { body: 'Hi from Bo', author_id: 'bo' })
    expect(forged.status).toBe(400)
    expect((await forged.json()).errors).toEqual([{ field: 'author_id', code: 'read-only', message: '"author_id" is read-only' }])

    const moved = await call('/messages/1', { method: 'PATCH', headers: { 'if-match': '*' }, body: JSON.stringify({ author_id: 'bo' }) })
    expect(moved.status).toBe(400)
  })
})

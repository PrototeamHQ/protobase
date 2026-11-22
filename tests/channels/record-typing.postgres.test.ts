import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SocketLike } from '@protobase/client'
import { f, resource, type AccessContext } from '@protobase/schema'
import { backgroundSettled, createAdmin } from '@protobase/server'
import { npmWs } from '../../packages/server/tests/support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { followRecordTyping } from '../../packages/ui/src/typing/record-channel-typing'
import { createTypersStore } from '../../packages/ui/src/typing/typers-store'
import { typersOn, typingSpot } from '../../packages/ui/src/typing/typing'

// A conversation page's typing without a realtime relay, over the record's own channel on a real server: alice and bob
// may read room 1, carol may not.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const rooms = resource('rooms')
  .table('rooms')
  .fields({ id: f.integer().readOnly(), team: f.text() })
  .primaryKey((r) => r.id)
  .access({ read: ({ user }: AccessContext) => `team = "${user!.roles![0]}"`, list: () => true })

const teams: Record<string, string> = { alice: 'red', bob: 'red', carol: 'blue' }

const waitFor = (check: () => void) => vi.waitFor(check, { timeout: 10_000, interval: 50 })

describe.skipIf(!(await postgresTemplateReady('empty')))('typing over a record channel, without a relay', () => {
  let pg: PostgresDatabase
  let server: Server
  let url: string
  const stops: Array<() => void> = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('empty')
    await pg.exec(`create table rooms (id integer generated always as identity primary key, team text not null);
      insert into rooms (team) values ('red');`)
    const admin = createAdmin({
      resources: [rooms],
      db: pg.db,
      authenticate: (request) => {
        const user = request.headers.get('x-user')!
        return { user: { id: user, roles: [teams[user]!] } }
      },
      files: { storage: false },
      options: { onUnhandledError: (error) => errors.push(error) },
      upgradeWebSocket,
    })
    server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new npmWs.WebSocketServer({ noServer: true }) } }) as Server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    for (const stop of stops) stop()
    await backgroundSettled()
    await new Promise((resolve) => server?.close(resolve))
    await pg?.close()
    expect(errors).toEqual([])
  })

  // The person's page on room 1, signed in as them: its record channel's typing, as the conversation page follows it.
  const page = (user: string) => {
    const client = createClient({ baseUrl: `${url}/api/v1`, webSocket: (address, protocols) => new npmWs.WebSocket(address, protocols, { headers: { 'x-user': user } }) as unknown as SocketLike })
    const channel = client.channel('rooms', '1')
    const store = createTypersStore()
    const typing = followRecordTyping(channel, 'rooms/1', store)
    stops.push(() => {
      typing.stop()
      store.stop()
      channel.leave()
    })
    return { channel, typing, typers: (thread: string | null) => typersOn(store.typers(), typingSpot('rooms/1', thread), user) }
  }

  it('shows a reader who types to the other reader, in the thread they type in, and not to a non-reader', async () => {
    const alice = page('alice')
    const bob = page('bob')
    const carol = page('carol')
    await waitFor(() => expect([alice.channel.status().state, bob.channel.status().state]).toEqual(['joined', 'joined']))
    await waitFor(() => expect(carol.channel.status()).toMatchObject({ state: 'refused', error: { code: 'not-found' } }))
    expect(carol.typing.send({ typing: true, thread: null })).toBe(false)

    expect(alice.typing.send({ typing: true, thread: null })).toBe(true)
    await waitFor(() => expect(bob.typers(null)).toEqual(['alice']))
    expect(bob.typers('7')).toEqual([])
    expect(alice.typers(null)).toEqual([])

    expect(bob.typing.send({ typing: true, thread: 7 })).toBe(true)
    await waitFor(() => expect(alice.typers('7')).toEqual(['bob']))
    expect(alice.typers(null)).toEqual([])

    expect(alice.typing.send({ typing: false, thread: null })).toBe(true)
    await waitFor(() => expect(bob.typers(null)).toEqual([]))
    expect(carol.typers(null)).toEqual([])
    expect(carol.typers('7')).toEqual([])
  })
})

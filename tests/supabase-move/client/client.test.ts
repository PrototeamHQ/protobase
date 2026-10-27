import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { moveApp } from './moved-app'
import { createSourceDatabase } from './source-database'
import { startStorageApi } from './storage-api'
import { alice, bob, bucket, fileName } from './users'

// A Supabase project moved with `protobase import supabase` serving its users' unchanged supabase-js client: the sample
// of source.sql and project/ on Supabase's Postgres image, imported for real into a new app on Postgres, migrated and
// started as the docs say, and called by supabase-js with only the URL and the key changed. Each case crosses a seam
// between the import and an endpoint of /api/sb that their own tests check apart.
//
//   bun run db:up && bun run test:supabase-move
//
// It needs Docker: docker-compose.yml's Postgres and Supabase's Postgres image (TEST_POSTGRES_URL and
// TEST_SUPABASE_POSTGRES_URL name others), and pg_dump and psql of postgres:18 (pg-tools/) unless PG_BIN names a
// folder with those of version 17 or newer. CI runs it in the supabase-move job when a change reaches it.

const storageKey = `sb_secret_${'0'.repeat(32)}`
let source: Awaited<ReturnType<typeof createSourceDatabase>>
let storageApi: Awaited<ReturnType<typeof startStorageApi>>
let app: Awaited<ReturnType<typeof moveApp>>
const clients: SupabaseClient[] = []
// Each user signed in once, as an app's client stays: the sign-in endpoint limits its calls as Supabase Auth does.
const sessions = new Map<string, { supabase: SupabaseClient; userId: string | undefined }>()

beforeAll(async () => {
  source = await createSourceDatabase()
  storageApi = await startStorageApi(storageKey)
  app = await moveApp({ sourceUrl: source.url, storageUrl: storageApi.url, storageKey })
  for (const user of [alice, bob]) {
    const supabase = client()
    const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password })
    if (error) throw error
    sessions.set(user.id, { supabase, userId: data.user?.id })
  }
}, 300_000)

afterAll(async () => {
  for (const client of clients) await client.removeAllChannels()
  await app?.dispose()
  await storageApi?.close()
  await source?.dispose()
}, 60_000)

// A Supabase app's client: createClient with the app's /api/sb and its publishable key, nothing else.
const client = (key = app.publishableKey) => {
  const created = createClient(app.base, key)
  clients.push(created)
  return created
}

const signedIn = (user: typeof alice) => sessions.get(user.id)!.supabase

/** Resolves with the first status the channel's join reports, such as `SUBSCRIBED` or `CHANNEL_ERROR`. */
const subscribed = (channel: RealtimeChannel) => new Promise<string>((resolve) => channel.subscribe((status) => resolve(status)))

describe('a Supabase project moved with protobase import supabase', () => {
  it('starts with the steps the docs and the import report name, and nothing else', () => {
    expect(app.steps).toEqual([
      'protobase import supabase <source>',
      'bun run db:migrate',
      'protobase import supabase --storage-url <project>',
      'bun run db:migrate',
      'protobase migration',
      'bun run db:migrate',
      'bun run dev',
    ])
    expect(app.report).toContain('run `protobase migration` and apply it')
    expect(app.report).toMatch(/## Packages added[\s\S]*@supabase\/supabase-js/)
  })

  it('signs each imported user in with the password they had on Supabase, and refuses a wrong one', async () => {
    for (const user of [alice, bob]) expect(sessions.get(user.id)?.userId).toBe(user.id)
    const { data, error } = await client().auth.signInWithPassword({ email: alice.email, password: 'not-her-password' })
    expect(error?.status).toBe(400)
    expect(data.session).toBeNull()
  })

  it("keeps the restored policies on auth.uid(): a user reads their own rows, cannot add one as another user, and anon reads none", async () => {
    const supabase = signedIn(alice)
    const own = await supabase.from('notes').select('owner, body').order('id')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([
      { owner: alice.id, body: 'Alice buys milk' },
      { owner: alice.id, body: 'Alice ships the release' },
    ])
    const asBob = await supabase.from('notes').insert({ owner: bob.id, list_id: 1, body: 'Alice writes as Bob' })
    expect(asBob.error?.code).toBe('42501')
    const anon = await client().from('notes').select('body')
    expect(anon).toMatchObject({ error: null, data: [] })
  })

  it('answers an embedded select through the foreign key and an rpc() call as PostgREST does', async () => {
    const supabase = signedIn(alice)
    const embedded = await supabase.from('notes').select('body, lists(name)').order('id')
    expect(embedded.error).toBeNull()
    expect(embedded.data).toEqual([
      { body: 'Alice buys milk', lists: { name: 'Home' } },
      { body: 'Alice ships the release', lists: { name: 'Work' } },
    ])
    // Bob's note in Home is not hers, so the function, under her row security, counts one.
    expect(await supabase.rpc('note_count', { list: 1 })).toMatchObject({ error: null, data: 1 })
  })

  it("serves each user's imported file with its bytes, refuses another user's, and takes an upload into their own folder", async () => {
    const supabase = signedIn(alice)
    const own = await supabase.storage.from(bucket).download(fileName(alice))
    expect(own.error).toBeNull()
    expect(await own.data?.text()).toBe(alice.file)
    const others = await supabase.storage.from(bucket).download(fileName(bob))
    expect(others.data).toBeNull()
    expect(others.error).not.toBeNull()
    const upload = await supabase.storage.from(bucket).upload(`${alice.id}/new.txt`, new Blob(['Alice uploads'], { type: 'text/plain' }))
    expect(upload.error).toBeNull()
    expect(await (await supabase.storage.from(bucket).download(`${alice.id}/new.txt`)).data?.text()).toBe('Alice uploads')
    const intoBobs = await supabase.storage.from(bucket).upload(`${bob.id}/new.txt`, new Blob(['Alice writes as Bob'], { type: 'text/plain' }))
    expect(intoBobs.error).not.toBeNull()
  })

  it("runs the converted Edge Function as the caller: it calls back with the caller's token and gets only their rows", async () => {
    const asAlice = await signedIn(alice).functions.invoke('own-notes')
    expect(asAlice.error).toBeNull()
    expect(asAlice.data).toEqual([{ body: 'Alice buys milk' }, { body: 'Alice ships the release' }])
    const asBob = await signedIn(bob).functions.invoke('own-notes')
    expect(asBob.data).toEqual([{ body: 'Bob fixes the bike' }])
  })

  it("sends a user the postgres_changes of the table the import made live: their own insert, not another user's", async () => {
    const supabase = signedIn(alice)
    const inserted: string[] = []
    let heard: (body: string) => void = () => {}
    const aliceHeard = new Promise<string>((resolve) => (heard = resolve))
    const channel = supabase.channel('notes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, (change) => {
      inserted.push(change.new.body)
      if (change.new.owner === alice.id) heard(change.new.body)
    })
    expect(await subscribed(channel)).toBe('SUBSCRIBED')
    // Bob's insert commits first, so it would reach her before her own.
    expect((await signedIn(bob).from('notes').insert({ owner: bob.id, list_id: 2, body: 'Bob plans the trip' })).error).toBeNull()
    expect((await supabase.from('notes').insert({ owner: alice.id, list_id: 2, body: 'Alice books the hotel' })).error).toBeNull()
    expect(await aliceHeard).toBe('Alice books the hotel')
    expect(inserted).toEqual(['Alice books the hotel'])
  })

  it('lets only the user the restored realtime.messages policy allows join the private topic, and sends her its broadcasts', async () => {
    const aliceChannel = signedIn(alice).channel('room:alice', { config: { private: true } })
    let heard: (payload: unknown) => void = () => {}
    const broadcast = new Promise((resolve) => (heard = resolve))
    aliceChannel.on('broadcast', { event: 'hello' }, ({ payload }) => heard(payload))
    expect(await subscribed(aliceChannel)).toBe('SUBSCRIBED')
    expect(await subscribed(signedIn(bob).channel('room:alice', { config: { private: true } }))).toBe('CHANNEL_ERROR')
    // The app's server, with the secret key, broadcasting without joining.
    const sent = await client(app.secretKey).channel('room:alice', { config: { private: true } }).httpSend('hello', { from: 'the server' })
    expect(sent).toEqual({ success: true })
    expect(await broadcast).toEqual({ from: 'the server' })
  })
})

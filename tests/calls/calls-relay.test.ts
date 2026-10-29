import { SignJWT } from 'jose'
import type { Browser, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LiveKitBackend } from '@protobase/server'
import type { PostgresDatabase } from '../../test-support/postgres-database'
import { callBrowsers, callPage, callsDatabase, launchCallBrowser } from './support/call-browsers'
import { startCallServer } from './support/call-server'

// The calls relay's contract with the LiveKit plugin, the prototype's scenarios: members in Chromium and Firefox join
// the call on a meeting through the app's function socket, and their media flows to and from a real LiveKit server.
// Start LiveKit with `bun run calls:up`; LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET point the test at another.
// The peer plugin's contract is peer-calls.test.ts.
const backend: LiveKitBackend = {
  kind: 'livekit',
  url: process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880',
  apiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
  apiSecret: process.env.LIVEKIT_API_SECRET ?? 'secretsecretsecretsecretsecretsecret',
}
const httpUrl = backend.url.replace(/^ws/, 'http')

const waitLong = { timeout: 20_000, interval: 250 }

describe.each(callBrowsers)('the LiveKit bridge, in %s', (name) => {
  let database: PostgresDatabase
  let server: Awaited<ReturnType<typeof startCallServer>>
  let browser: Browser
  const pages: Page[] = []

  beforeAll(async () => {
    const reachable = await fetch(httpUrl).then((response) => response.ok, () => false)
    if (!reachable) throw new Error(`No LiveKit server at ${httpUrl}: start one with bun run calls:up`)
    database = await callsDatabase()
    server = await startCallServer({ calls: { backend }, db: database.db, page: await callPage() })
    browser = await launchCallBrowser(name)
  })

  afterEach(async () => {
    await Promise.all(pages.splice(0).map((page) => page.close()))
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
    await database?.close()
  })

  const newCall = () => `call-${crypto.randomUUID()}`

  /** A member's page, joined to the call on the meeting with the function's query. */
  const join = async (query: string) => {
    const page = await browser.newPage()
    pages.push(page)
    await page.goto(`${server.origin}/`)
    await page.waitForFunction(() => window.member !== undefined)
    await page.evaluate((q) => window.member.join(q), query)
    return page
  }

  const received = (page: Page) => page.evaluate(() => window.member.received())
  const tracksOf = (page: Page) => page.evaluate(() => window.member.tracks())

  /** Waits until media of the kind keeps arriving: more bytes, and for video more decoded frames, than a moment ago. */
  const flowing = async (page: Page, kind: 'audio' | 'video') => {
    const before = await received(page)
    await vi.waitFor(async () => {
      const now = await received(page)
      expect(now[kind].bytes).toBeGreaterThan(before[kind].bytes + 1000)
      if (kind === 'video') expect(now.video.frames).toBeGreaterThan(before.video.frames + 10)
    }, waitLong)
  }

  /** A LiveKit admin token for the room, as Protobase's driver would mint one for RoomService. */
  const adminToken = (room: string) =>
    new SignJWT({ video: { room, roomAdmin: true } })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(backend.apiKey)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(backend.apiSecret))

  it('lets a listener who joins later receive the camera and microphone of a member already publishing', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await vi.waitFor(async () => {
      const tracks = await tracksOf(bob)
      expect(tracks.map(({ member, source, receiving }) => ({ member, source, receiving })).sort((a, b) => a.source.localeCompare(b.source))).toEqual([
        { member: 'alice', source: 'camera', receiving: true },
        { member: 'alice', source: 'microphone', receiving: true },
      ])
    }, waitLong)
    await flowing(bob, 'video')
    await flowing(bob, 'audio')
  })

  it('refuses a listener who publishes', async () => {
    const bob = await join(`as=bob&call=${newCall()}&role=listener`)
    expect(await bob.evaluate(() => window.member.publishRefusal())).toBe('The member may not publish these tracks')
  })

  it('reaches the others when a member starts publishing mid-call', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    const carol = await join(`as=carol&call=${call}`)
    await flowing(carol, 'video')
    await carol.evaluate(() => window.member.publish(['camera']))
    await vi.waitFor(async () => expect(await tracksOf(alice)).toEqual([expect.objectContaining({ member: 'carol', source: 'camera', receiving: true })]), waitLong)
    await flowing(alice, 'video')
  })

  it('tells the others of a mute and an unpublished track', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await vi.waitFor(async () => expect(await tracksOf(bob)).toHaveLength(2), waitLong)
    await alice.evaluate(() => window.member.mute('microphone', true))
    await vi.waitFor(async () => expect(await tracksOf(bob)).toContainEqual(expect.objectContaining({ source: 'microphone', muted: true })), waitLong)
    await alice.evaluate(() => window.member.unpublish('camera'))
    await vi.waitFor(async () => expect((await tracksOf(bob)).map((track) => track.source)).toEqual(['microphone']), waitLong)
  })

  it('forwards the simulcast layer that fits how large a member shows the video', async () => {
    const call = newCall()
    const erin = await join(`as=erin&call=${call}`)
    await erin.evaluate(() => window.member.publish(['camera'], true))
    const frank = await join(`as=frank&call=${call}&role=listener`)
    await vi.waitFor(async () => expect(await tracksOf(frank)).toEqual([expect.objectContaining({ receiving: true })]), waitLong)
    const { sid } = (await tracksOf(frank))[0]!
    await frank.evaluate((track) => window.member.view([track], 160, 90), sid)
    await vi.waitFor(async () => expect(await frank.evaluate((track) => window.member.shownWidth(track), sid)).toBe(160), waitLong)
    await frank.evaluate((track) => window.member.view([track], 1280, 720), sid)
    await vi.waitFor(async () => expect(await frank.evaluate((track) => window.member.shownWidth(track), sid)).toBeGreaterThan(160), waitLong)
  })

  it('lets Protobase decide who hears whom', async () => {
    const call = newCall()
    const gina = await join(`as=gina&call=${call}`)
    const hank = await join(`as=hank&call=${call}`)
    await gina.evaluate(() => window.member.publish(['camera', 'microphone']))
    await hank.evaluate(() => window.member.publish(['camera', 'microphone']))
    const ivan = await join(`as=ivan&call=${call}&role=listener&hears=gina`)
    await vi.waitFor(async () => expect(await tracksOf(ivan)).toEqual([expect.objectContaining({ member: 'gina', source: 'camera', receiving: true })]), waitLong)
    await flowing(ivan, 'video')
    expect((await received(ivan)).audio.bytes).toBe(0)
  })

  it('resumes members on new sockets from their browsers alone, with media flowing throughout', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    const carol = await join(`as=carol&call=${call}`)
    await carol.evaluate(() => window.member.publish(['camera']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await vi.waitFor(async () => expect(await tracksOf(bob)).toHaveLength(3), waitLong)
    await flowing(bob, 'video')
    server.dropSockets()
    await vi.waitFor(async () => {
      for (const page of [alice, bob, carol]) expect(await page.evaluate(() => window.member.states())).toEqual(['connecting', 'joined', 'resuming', 'joined'])
    }, waitLong)
    await flowing(bob, 'video')
    // The resumed sessions still negotiate: a change after the resume reaches the other member.
    await alice.evaluate(() => window.member.unpublish('camera'))
    await vi.waitFor(async () => expect((await tracksOf(bob)).map(({ member, source }) => `${member} ${source}`).sort()).toEqual(['alice microphone', 'carol camera']), waitLong)
  })

  it('keeps media flowing through an ICE restart', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await flowing(bob, 'video')
    await alice.evaluate(() => window.member.restartIce())
    await bob.evaluate(() => window.member.restartIce())
    await flowing(bob, 'video')
  })

  it('takes a member who leaves out of the others\' tracks', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await vi.waitFor(async () => expect(await tracksOf(bob)).toHaveLength(1), waitLong)
    await alice.evaluate(() => window.member.leave())
    await vi.waitFor(async () => expect(await tracksOf(bob)).toEqual([]), waitLong)
    expect(await alice.evaluate(() => window.member.states())).toEqual(['connecting', 'joined', 'left'])
  })

  it('stops the sender of a member the media server no longer lets publish', async () => {
    const call = newCall()
    const alice = await join(`as=alice&call=${call}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    const bob = await join(`as=bob&call=${call}&role=listener`)
    await vi.waitFor(async () => expect(await tracksOf(bob)).toHaveLength(2), waitLong)
    // The LiveKit room is the call on the meeting, by its id.
    const room = (await alice.evaluate(() => window.member.callId()))!
    const response = await fetch(`${httpUrl}/twirp/livekit.RoomService/UpdateParticipant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await adminToken(room)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ room, identity: 'alice', permission: { canPublish: false, canSubscribe: true } }),
    })
    expect(response.status).toBe(200)
    await vi.waitFor(async () => expect((await alice.evaluate(() => window.member.unpublished())).sort()).toEqual(['camera', 'microphone']), waitLong)
    await vi.waitFor(async () => expect(await tracksOf(bob)).toEqual([]), waitLong)
  })

  it('reports no server errors', () => {
    expect(server.errors).toEqual([])
  })
})

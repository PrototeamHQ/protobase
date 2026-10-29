import type { Browser, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PostgresDatabase } from '../../test-support/postgres-database'
import { callBrowsers, callPage, callsDatabase, launchCallBrowser } from './support/call-browsers'
import { startCallServer } from './support/call-server'

// The peer plugin's contract: members in Chromium and Firefox join the call on a meeting through the app's function
// socket, kept in the calls schema of a Postgres test template's clone, and their media goes straight between their
// browsers. Two servers on the same database stand for two processes serving the app. `bun run test:db`, then
// `bun run test:calls`.

const waitLong = { timeout: 20_000, interval: 250 }
const within = (ms: number) => ({ timeout: ms, interval: 50 })

describe.each(callBrowsers)('peer-to-peer calls on records, in %s', (name) => {
  let database: PostgresDatabase
  let server: Awaited<ReturnType<typeof startCallServer>>
  let other: Awaited<ReturnType<typeof startCallServer>>
  let browser: Browser
  const pages: Page[] = []

  beforeAll(async () => {
    database = await callsDatabase()
    const page = await callPage()
    const calls = { backend: { kind: 'peer' as const, maxMembers: 3 }, processes: 'many' as const }
    server = await startCallServer({ calls, db: database.db, page })
    other = await startCallServer({ calls, db: database.db, page })
    browser = await launchCallBrowser(name)
  })

  afterEach(async () => {
    await Promise.all(pages.splice(0).map((page) => page.close()))
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
    await other?.close()
    await database?.close()
  })

  const newMeeting = () => `meeting-${crypto.randomUUID()}`

  const open = async (on = server) => {
    const page = await browser.newPage()
    pages.push(page)
    await page.goto(`${on.origin}/`)
    await page.waitForFunction(() => window.member !== undefined)
    return page
  }
  /** A member's page, joined to the call on the meeting with the function's query, on the first server or the other. */
  const join = async (query: string, on = server) => {
    const page = await open(on)
    await page.evaluate((q) => window.member.join(q), query)
    return page
  }
  const tracksOf = (page: Page) => page.evaluate(() => window.member.tracks())
  const membersOf = (page: Page) => page.evaluate(() => window.member.members())
  const connectionsOf = (page: Page) => page.evaluate(() => window.member.openConnections())
  const callOf = async (page: Page) => (await page.evaluate(() => window.member.callId()))!

  /** Waits until video keeps arriving at the page: more bytes and more decoded frames than a moment ago. */
  const flowing = async (page: Page) => {
    const before = await page.evaluate(() => window.member.received())
    await vi.waitFor(async () => {
      const now = await page.evaluate(() => window.member.received())
      expect(now.video.bytes).toBeGreaterThan(before.video.bytes + 1000)
      expect(now.video.frames).toBeGreaterThan(before.video.frames + 10)
    }, waitLong)
  }

  it('sends media straight between the members\' browsers', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    await bob.evaluate(() => window.member.publish(['camera']))
    await vi.waitFor(async () => {
      expect((await tracksOf(bob)).map(({ member, source, receiving }) => `${member} ${source} ${receiving}`).sort()).toEqual(['alice camera true', 'alice microphone true'])
      expect((await tracksOf(alice)).map(({ member, source, receiving }) => `${member} ${source} ${receiving}`)).toEqual(['bob camera true'])
    }, waitLong)
    await flowing(bob)
    await flowing(alice)
  })

  it('refuses a listener who publishes', async () => {
    const bob = await join(`as=bob&call=${newMeeting()}&role=listener`)
    expect(await bob.evaluate(() => window.member.publishRefusal())).toBe('The member may not publish these tracks')
  })

  it('lists only the tracks Protobase lets a member hear', async () => {
    const meeting = newMeeting()
    const gina = await join(`as=gina&call=${meeting}`)
    const hank = await join(`as=hank&call=${meeting}`)
    await gina.evaluate(() => window.member.publish(['camera', 'microphone']))
    await hank.evaluate(() => window.member.publish(['camera']))
    const ivan = await join(`as=ivan&call=${meeting}&role=listener&hears=gina`)
    await vi.waitFor(async () => expect(await tracksOf(ivan)).toEqual([expect.objectContaining({ member: 'gina', source: 'camera', receiving: true })]), waitLong)
  })

  it('resumes members on new sockets while their browsers keep sending to each other', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    await flowing(bob)
    server.dropSockets()
    await vi.waitFor(async () => {
      for (const page of [alice, bob]) expect(await page.evaluate(() => window.member.states())).toEqual(['connecting', 'joined', 'resuming', 'joined'])
    }, waitLong)
    await flowing(bob)
    await alice.evaluate(() => window.member.unpublish('camera'))
    await vi.waitFor(async () => expect((await tracksOf(bob)).map((track) => track.source)).toEqual(['microphone']), waitLong)
  })

  it('lists a member who sends nothing in every member\'s list within 2 seconds', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    await alice.evaluate(() => window.member.publish(['camera']))
    const bob = await join(`as=bob&call=${meeting}&role=listener`)
    await vi.waitFor(async () => {
      expect(await membersOf(alice)).toEqual(['alice', 'bob'])
      expect(await membersOf(bob)).toEqual(['alice', 'bob'])
    }, within(2000))
  })

  it('takes a removed member out: the others\' connections to them close within 2 seconds, and their resume and join are refused', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`)
    const carol = await join(`as=carol&call=${meeting}`)
    await alice.evaluate(() => window.member.publish(['camera']))
    await vi.waitFor(async () => {
      for (const page of [alice, bob, carol]) expect(await connectionsOf(page)).toBe(2)
    }, waitLong)
    expect(await server.runtime.remove(await callOf(alice), 'bob')).toBe(true)
    await vi.waitFor(async () => {
      expect(await connectionsOf(alice)).toBe(1)
      expect(await connectionsOf(carol)).toBe(1)
      expect(await bob.evaluate(() => window.member.left())).toBe('removed')
      expect(await membersOf(alice)).toEqual(['alice', 'carol'])
    }, within(2000))
    const again = await open()
    expect(await again.evaluate((q) => window.member.tryJoin(q), `as=bob&call=${meeting}`)).toBe('removed')
  })

  it('refuses the resume of a member removed while their socket was down', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`)
    await vi.waitFor(async () => expect(await connectionsOf(alice)).toBe(1), waitLong)
    server.dropSockets()
    await server.runtime.remove(await callOf(alice), 'bob')
    await vi.waitFor(async () => {
      expect(await bob.evaluate(() => window.member.left())).toBe('removed')
      expect(await bob.evaluate(() => window.member.states())).toContain('resuming')
      expect(await connectionsOf(alice)).toBe(0)
    }, waitLong)
  })

  it('takes out a member who can no longer read the record within a minute', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const dave = await join(`as=dave&call=${meeting}`)
    await vi.waitFor(async () => expect(await connectionsOf(alice)).toBe(1), waitLong)
    server.denied.add('dave')
    await vi.waitFor(async () => {
      expect(await dave.evaluate(() => window.member.left())).toBe('removed')
      expect(await connectionsOf(alice)).toBe(0)
      expect(await membersOf(alice)).toEqual(['alice'])
    }, { timeout: 62_000, interval: 500 })
  }, 90_000)

  it('refuses one member more than the limit, with its reason', async () => {
    const meeting = newMeeting()
    for (const member of ['alice', 'bob', 'carol']) await join(`as=${member}&call=${meeting}&role=listener`)
    const erin = await open()
    expect(await erin.evaluate((q) => window.member.tryJoin(q), `as=erin&call=${meeting}`)).toBe('full')
  })

  it('ends the call\'s record once its last member left', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`)
    const record = { resource: 'meetings', key: meeting }
    expect((await server.runtime.of(record))[0]).toEqual(expect.objectContaining({ ended_at: null }))
    await alice.evaluate(() => window.member.leave())
    await bob.evaluate(() => window.member.leave())
    await vi.waitFor(async () => expect((await server.runtime.of(record))[0]!.ended_at).not.toBeNull(), within(2000))
  })

  it('meets two members that two processes serve in one call', async () => {
    const meeting = newMeeting()
    const alice = await join(`as=alice&call=${meeting}`)
    const bob = await join(`as=bob&call=${meeting}`, other)
    await alice.evaluate(() => window.member.publish(['camera']))
    await vi.waitFor(async () => {
      expect(await membersOf(bob)).toEqual(['alice', 'bob'])
      expect(await tracksOf(bob)).toEqual([expect.objectContaining({ member: 'alice', source: 'camera', receiving: true })])
    }, waitLong)
    await flowing(bob)
    expect(await callOf(bob)).toBe(await callOf(alice))
  })

  it('reports no server errors', () => {
    expect([...server.errors, ...other.errors]).toEqual([])
  })
})

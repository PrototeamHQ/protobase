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

  describe('guests', () => {
    // Ann is in the call and invites; Bob is in it too; Eve, from outside, waits in the lobby of Ann's link.
    const guestCall = async (publish: ('camera' | 'microphone')[] = ['camera', 'microphone']) => {
      const meeting = newMeeting()
      const ann = await join(`call=${meeting}&as=ann&invites=true`)
      const bob = await join(`call=${meeting}&as=bob`, other)
      const link = await ann.evaluate((sources) => window.member.guestLink(sources), publish)
      const eve = await open()
      const token = await eve.evaluate((at) => window.member.enterLobby(at, 'Eve'), link.token)
      await vi.waitFor(async () => expect(await ann.evaluate(() => window.member.lobby())).toEqual([{ guest: expect.any(String), name: 'Eve' }]), within(2500))
      const { guest } = (await ann.evaluate(() => window.member.lobby()))[0]!
      return { meeting, ann, bob, eve, link, token, guest }
    }

    it("lets in a guest a member admitted: in every member's list within 2 seconds, sending them media", async () => {
      const { ann, bob, eve, token, guest } = await guestCall()
      expect(await eve.evaluate((at) => window.member.waitState(at), token)).toBe('waiting')
      await ann.evaluate((id) => window.member.admit(id), guest)
      expect(await eve.evaluate((at) => window.member.waitState(at), token)).toBe('admitted')
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('joined')
      const started = Date.now()
      await vi.waitFor(async () => {
        for (const page of [ann, bob]) expect(await page.evaluate(() => window.member.named())).toContainEqual([`guest:${guest}`, 'Eve'])
      }, within(2000))
      expect(Date.now() - started).toBeLessThan(2000)
      await eve.evaluate(() => window.member.publish(['camera', 'microphone']))
      await vi.waitFor(async () => expect((await tracksOf(ann)).filter((track) => track.member === `guest:${guest}` && track.receiving)).toHaveLength(2), waitLong)
    })

    it('refuses a guest whose link allows only the microphone their camera, which no member hears', async () => {
      const { ann, eve, token, guest } = await guestCall(['microphone'])
      await ann.evaluate((id) => window.member.admit(id), guest)
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('joined')
      expect(await eve.evaluate(() => window.member.publish(['camera']).then(() => 'published', (error: Error) => error.message))).not.toBe('published')
      await eve.evaluate(() => window.member.publish(['microphone']))
      await vi.waitFor(async () => expect((await tracksOf(ann)).filter((track) => track.member === `guest:${guest}`).map((track) => track.source)).toEqual(['microphone']), waitLong)
    })

    it('never lets in a guest a member turned away', async () => {
      const { ann, bob, eve, token, guest } = await guestCall()
      await ann.evaluate((id) => window.member.deny(id), guest)
      expect(await eve.evaluate((at) => window.member.waitState(at), token)).toBe('denied')
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('refused')
      for (const page of [ann, bob]) expect(await membersOf(page)).toEqual(['ann', 'bob'])
    })

    it("takes out the guests of a revoked link within a second's read, and refuses their resume", async () => {
      const { ann, bob, eve, link, token, guest } = await guestCall()
      await ann.evaluate((id) => window.member.admit(id), guest)
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('joined')
      await vi.waitFor(async () => expect(await connectionsOf(eve)).toBe(2), waitLong)
      await ann.evaluate((id) => window.member.revoke(id), link.id)
      await vi.waitFor(async () => expect(await eve.evaluate(() => window.member.left())).toBe('removed'), within(2000))
      await vi.waitFor(async () => {
        for (const page of [ann, bob]) expect(await connectionsOf(page)).toBe(1)
      }, within(2000))
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('refused')
      expect(await membersOf(ann)).toEqual(['ann', 'bob'])
    })

    it('ends a call left to a guest two minutes after the last member left', async () => {
      const { ann, bob, eve, token, guest } = await guestCall()
      await ann.evaluate((id) => window.member.admit(id), guest)
      expect(await eve.evaluate((at) => window.member.joinAsGuest(at), token)).toBe('joined')
      await ann.evaluate(() => window.member.leave())
      await bob.evaluate(() => window.member.leave())
      await vi.waitFor(async () => expect(await membersOf(eve)).toEqual([`guest:${guest}`]), waitLong)
      // Two minutes on, as the sweep sees it: the members left that long ago.
      await database.exec("update calls.members set left_at = now() - interval '121 seconds' where member in ('ann', 'bob') and left_at is not null")
      await vi.waitFor(async () => expect(await eve.evaluate(() => window.member.left())).toBe('ended'), { timeout: 15_000, interval: 250 })
      expect(await eve.evaluate((at) => window.member.waitState(at), token)).toBe('ended')
    })
  })

  it('reports no server errors', () => {
    expect([...server.errors, ...other.errors]).toEqual([])
  })
})

// Chromium and Firefox in one call, Chromium's member first by id, so their offers cross with Chromium the side that
// would give way; a second Chromium makes a third member.
describe('peer-to-peer calls between Chromium and Firefox', () => {
  let database: PostgresDatabase
  let server: Awaited<ReturnType<typeof startCallServer>>
  const browsers: Browser[] = []

  beforeAll(async () => {
    database = await callsDatabase()
    server = await startCallServer({ calls: { backend: { kind: 'peer' } }, db: database.db, page: await callPage() })
    browsers.push(await launchCallBrowser('chromium'), await launchCallBrowser('firefox'), await launchCallBrowser('chromium'))
  })

  afterAll(async () => {
    await Promise.all(browsers.map((browser) => browser.close()))
    await server?.close()
    await database?.close()
  })

  it("sends both members' media when one joins a call that already sends to them", async () => {
    const meeting = `meeting-${crypto.randomUUID()}`
    const open = async (index: number) => {
      const page = await browsers[index]!.newPage()
      await page.goto(`${server.origin}/`)
      await page.waitForFunction(() => window.member !== undefined)
      return page
    }
    const alice = await open(0)
    await alice.evaluate((q) => window.member.join(q), `as=alice&call=${meeting}`)
    await alice.evaluate(() => window.member.publish(['camera', 'microphone']))
    // Bob sends as soon as he is in, as Alice's browser offers him hers.
    const bob = await open(1)
    await bob.evaluate(async (q) => {
      await window.member.join(q)
      await window.member.publish(['camera', 'microphone'])
    }, `as=bob&call=${meeting}`)
    await vi.waitFor(async () => {
      expect((await alice.evaluate(() => window.member.tracks())).map(({ member, source, receiving }) => `${member} ${source} ${receiving}`).sort()).toEqual(['bob camera true', 'bob microphone true'])
      expect((await bob.evaluate(() => window.member.tracks())).map(({ member, source, receiving }) => `${member} ${source} ${receiving}`).sort()).toEqual(['alice camera true', 'alice microphone true'])
    }, waitLong)
    // Media arrives in both browsers: video frames are decoded on each side.
    for (const page of [alice, bob]) {
      await vi.waitFor(async () => expect((await page.evaluate(() => window.member.received())).video.frames).toBeGreaterThan(10), waitLong)
    }
    expect(server.errors).toEqual([])
  })

  it('sends every pair of three members their media when all join at once and send as soon as they are in', async () => {
    const meeting = `meeting-${crypto.randomUUID()}`
    // Each sends right after joining, as the call view does, so the offers of most pairs cross.
    const pages = await Promise.all(
      ['ann', 'bob', 'cat'].map(async (name, index) => {
        const page = await browsers[index]!.newPage()
        await page.goto(`${server.origin}/`)
        await page.waitForFunction(() => window.member !== undefined)
        await page.evaluate(async (q) => {
          await window.member.join(q)
          await window.member.publish(['camera', 'microphone'])
        }, `as=${name}&call=${meeting}`)
        return page
      }),
    )
    // Video frames are decoded on both connections of every member.
    await vi.waitFor(async () => {
      for (const page of pages) {
        const frames = await page.evaluate(() => window.member.framesEach())
        expect(frames).toHaveLength(2)
        for (const decoded of frames) expect(decoded).toBeGreaterThan(10)
      }
    }, waitLong)
    await Promise.all(pages.map((page) => page.close()))
    expect(server.errors).toEqual([])
  })
})

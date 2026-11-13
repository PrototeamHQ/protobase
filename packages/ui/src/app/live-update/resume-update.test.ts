import { describe, expect, it } from 'vitest'
import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import { createLiveUpdater } from './live-updater'
import { createResumeUpdate } from './resume-update'

class Refused extends Error {}

const minute = 60_000

// A plugin that runs bundle `a` and has `next` set for the next start, and a server that answers `given`.
const setup = ({
  next = 'b',
  given,
  holdsChanges = false,
  refuseReload = false,
}: {
  next?: string | null
  given?: MobileReleaseAnswer
  holdsChanges?: boolean
  refuseReload?: boolean
} = {}) => {
  const methods: string[] = []
  const pages: string[] = []
  let now = 0
  const bridge = {
    Exception: Refused,
    nativePromise: async (_plugin: string, method: string) => {
      methods.push(method)
      if (method === 'getCurrentBundle') return { bundleId: 'a' }
      if (method === 'getNextBundle') return { bundleId: next }
      if (method === 'reload' && refuseReload) throw new Refused('LiveUpdate.reload refused')
    },
  }
  const updater = createLiveUpdater({
    bridge,
    check: async () => given,
    releasesUrl: 'https://shop.example.com/api/mobile/releases',
  })
  const page = {
    keep: () => void pages.push('kept'),
    forget: () => void pages.push('forgotten'),
  }
  const resume = createResumeUpdate({
    updater,
    holdsChanges: () => holdsChanges,
    page,
    now: () => now,
  })
  const awayFor = async (ms: number) => {
    resume.leave()
    now += ms
    await resume.back()
  }
  return { methods, pages, awayFor }
}

describe('createResumeUpdate', () => {
  it('reloads into the downloaded release after 6 minutes away, keeping the page first', async () => {
    const app = setup()
    await app.awayFor(6 * minute)
    expect(app.methods).toContain('reload')
    expect(app.pages).toEqual(['kept'])
  })

  it('reloads at exactly 5 minutes away', async () => {
    const app = setup()
    await app.awayFor(5 * minute)
    expect(app.methods).toContain('reload')
  })

  it('changes nothing after 2 minutes away, and only checks for a release', async () => {
    const app = setup()
    await app.awayFor(2 * minute)
    expect(app.methods).not.toContain('reload')
    expect(app.pages).toEqual([])
  })

  it('never reloads when the app comes back without having left', async () => {
    const app = setup()
    await app.awayFor(0)
    expect(app.methods).not.toContain('reload')
  })

  it('never reloads over unsaved changes, and takes the release at a later return', async () => {
    const app = setup({ holdsChanges: true })
    await app.awayFor(10 * minute)
    expect(app.methods).not.toContain('reload')
  })

  it('checks for a release when none is downloaded, setting it next for a later return', async () => {
    const app = setup({
      next: 'a',
      given: { bundleId: 'c', url: null, required: false },
    })
    await app.awayFor(10 * minute)
    expect(app.methods).not.toContain('reload')
    expect(app.methods).toContain('setNextBundle')
    expect(app.pages).toEqual([])
  })

  it("never reloads into the app's own files", async () => {
    const app = setup({ next: null })
    await app.awayFor(10 * minute)
    expect(app.methods).not.toContain('reload')
  })

  it('forgets the page and checks when the guard refuses the reload', async () => {
    const app = setup({ refuseReload: true })
    await app.awayFor(10 * minute)
    expect(app.pages).toEqual(['kept', 'forgotten'])
    expect(app.methods.slice(-2)).toEqual(['getCurrentBundle', 'getNextBundle'])
  })
})

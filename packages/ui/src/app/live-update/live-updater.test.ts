import { describe, expect, it, vi } from 'vitest'
import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import { createLiveUpdater } from './live-updater'

class Refused extends Error {}

type Handler = (options: Record<string, unknown>) => unknown

// A bridge whose LiveUpdate answers as the guard does: its own files run, and downloads and sets succeed, unless a test
// gives a method a handler of its own.
const bridge = (handlers: Record<string, Handler> = {}) => {
  const calls: Array<[string, Record<string, unknown>]> = []
  const answers: Record<string, Handler> = { getCurrentBundle: () => ({ bundleId: null }), getNextBundle: () => ({ bundleId: null }), ...handlers }
  return {
    calls,
    methods: () => calls.map(([method]) => method),
    bridge: {
      Exception: Refused,
      nativePromise: async (plugin: string, method: string, options: object) => {
        expect(plugin).toBe('LiveUpdate')
        calls.push([method, options as Record<string, unknown>])
        return answers[method]?.(options as Record<string, unknown>)
      },
    },
  }
}

const releasesUrl = 'https://shop.example.com/api/mobile/releases'
const answer = (bundleId: string | null, required = false): MobileReleaseAnswer => ({ bundleId, url: bundleId && `${releasesUrl}/${bundleId}`, required })

const updater = (fake: ReturnType<typeof bridge>, given: MobileReleaseAnswer | undefined) => createLiveUpdater({ bridge: fake.bridge, check: async () => given, releasesUrl })

describe('createLiveUpdater', () => {
  it('tells the plugin the files it runs started', async () => {
    const fake = bridge()
    await updater(fake, undefined).ready()
    expect(fake.methods()).toEqual(['ready'])
  })

  it('downloads a new release in manifest mode from the app releases URL, and sets it next without reloading', async () => {
    const fake = bridge()
    await updater(fake, answer('b')).check()
    expect(fake.calls.filter(([method]) => !method.startsWith('get'))).toEqual([
      ['downloadBundle', { bundleId: 'b', url: `${releasesUrl}/b`, artifactType: 'manifest' }],
      ['setNextBundle', { bundleId: 'b' }],
    ])
  })

  it('changes nothing without an answer, for no release, or for the release it runs', async () => {
    for (const given of [undefined, answer(null), answer(null, true), answer('a')]) {
      const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'a' }) })
      await updater(fake, given).check()
      expect(fake.methods(), JSON.stringify(given)).toEqual(['getCurrentBundle', 'getNextBundle'])
    }
  })

  it('keeps the files it runs when the guard refuses the release, and sets nothing it could not download', async () => {
    const fake = bridge({
      downloadBundle: () => {
        throw new Refused('LiveUpdate.downloadBundle refused release b')
      },
    })
    await updater(fake, answer('b')).check()
    expect(fake.methods()).not.toContain('setNextBundle')
  })

  it('does nothing when the guard refuses every call, as when it refuses to load', async () => {
    const refuse = () => {
      throw new Refused('LiveUpdate refused to load')
    }
    const fake = bridge({ getCurrentBundle: refuse, getNextBundle: refuse, reload: refuse })
    await expect(updater(fake, answer('b')).check()).resolves.toBeUndefined()
    expect(await updater(fake, undefined).applyNext(() => {})).toBe(false)
  })

  it('throws what is no refusal', async () => {
    const fake = bridge({
      downloadBundle: () => {
        throw new RangeError('bug')
      },
    })
    await expect(updater(fake, answer('b')).check()).rejects.toThrow('bug')
  })

  it('runs one check at a time', async () => {
    let finish = () => {}
    const fake = bridge({ downloadBundle: () => new Promise<void>((resolve) => (finish = resolve)) })
    const live = updater(fake, answer('b'))
    const first = live.check()
    const second = live.check()
    expect(second).toBe(first)
    await vi.waitFor(() => expect(fake.methods()).toContain('downloadBundle'))
    finish()
    await first
    expect(fake.methods().filter((method) => method === 'downloadBundle')).toHaveLength(1)
  })

  it('skips a required release, which the guard refuses, without downloading or reloading', async () => {
    const fake = bridge()
    await updater(fake, answer('b', true)).check()
    expect(fake.methods()).toEqual(['getCurrentBundle', 'getNextBundle'])
  })

  it('never asks the plugin for its own files', async () => {
    const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'a' }) })
    for (const given of [answer(null), answer(null, true), undefined]) await updater(fake, given).check()
    expect(fake.calls.filter(([method]) => ['setNextBundle', 'reset'].includes(method))).toEqual([])
  })

  it('shows the splash before the reload, and hides it again when the reload does not happen', async () => {
    const steps: string[] = []
    const splash = { show: async () => void steps.push('show'), hide: async () => void steps.push('hide') }
    const reloading = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'b' }), reload: () => void steps.push('reload') })
    expect(await createLiveUpdater({ bridge: reloading.bridge, check: async () => undefined, releasesUrl, splash }).applyNext(() => {})).toBe(true)
    expect(steps).toEqual(['show', 'reload'])
    steps.length = 0
    const refusing = bridge({
      getNextBundle: () => ({ bundleId: 'b' }),
      reload: () => {
        throw new Refused('LiveUpdate.reload refused')
      },
    })
    expect(await createLiveUpdater({ bridge: refusing.bridge, check: async () => undefined, releasesUrl, splash }).applyNext(() => {})).toBe(false)
    expect(steps).toEqual(['show', 'hide'])
  })

  it('reloads into the release set next after beforeReload, and leaves telling the plugin it started to that release', async () => {
    const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'b' }) })
    const order: string[] = []
    expect(await updater(fake, undefined).applyNext(() => void order.push('beforeReload'))).toBe(true)
    expect(order).toEqual(['beforeReload'])
    expect(fake.methods().filter((method) => !method.startsWith('get'))).toEqual(['reload'])
  })

  it("applies nothing when the release set next runs already or is the app's own files", async () => {
    for (const next of ['a', null]) {
      const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: next }) })
      let kept = false
      expect(await updater(fake, undefined).applyNext(() => (kept = true))).toBe(false)
      expect(kept).toBe(false)
      expect(fake.methods()).not.toContain('reload')
    }
  })

  it('applies nothing when the guard refuses the reload, and throws what is no refusal', async () => {
    const refusing = bridge({
      getNextBundle: () => ({ bundleId: 'b' }),
      reload: () => {
        throw new Refused('LiveUpdate.reload refused')
      },
    })
    expect(await updater(refusing, undefined).applyNext(() => {})).toBe(false)
    const broken = bridge({
      getNextBundle: () => ({ bundleId: 'b' }),
      reload: () => {
        throw new RangeError('bug')
      },
    })
    await expect(updater(broken, undefined).applyNext(() => {})).rejects.toThrow('bug')
  })
})

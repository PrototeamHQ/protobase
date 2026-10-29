import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MobileReleaseAnswer } from '@protobase/schema/internal'
import { createLiveUpdater, requiredUpdateTimeoutMs } from './live-updater'

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

const updater = (fake: ReturnType<typeof bridge>, given: MobileReleaseAnswer | undefined, onHold = (_: boolean) => {}) =>
  createLiveUpdater({ bridge: fake.bridge, check: async () => given, releasesUrl, onHold })

afterEach(() => vi.useRealTimers())

describe('createLiveUpdater', () => {
  it('tells the plugin the files it runs started', async () => {
    const fake = bridge()
    await updater(fake, undefined).ready()
    expect(fake.methods()).toEqual(['ready'])
  })

  it('downloads a new release in manifest mode from the app releases URL, and sets it next without reloading', async () => {
    const fake = bridge()
    await updater(fake, answer('b')).check(true)
    expect(fake.calls.filter(([method]) => !method.startsWith('get'))).toEqual([
      ['downloadBundle', { bundleId: 'b', url: `${releasesUrl}/b`, artifactType: 'manifest' }],
      ['setNextBundle', { bundleId: 'b' }],
    ])
  })

  it('changes nothing without an answer, for no release, or for the release it runs', async () => {
    for (const given of [undefined, answer(null), answer(null, true), answer('a')]) {
      const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'a' }) })
      await updater(fake, given).check(true)
      expect(fake.methods(), JSON.stringify(given)).toEqual(['getCurrentBundle', 'getNextBundle'])
    }
  })

  it('keeps the files it runs when the guard refuses the release, and sets nothing it could not download', async () => {
    const fake = bridge({
      downloadBundle: () => {
        throw new Refused('LiveUpdate.downloadBundle refused release b')
      },
    })
    await updater(fake, answer('b')).check(true)
    expect(fake.methods()).not.toContain('setNextBundle')
  })

  it('throws what is no refusal', async () => {
    const fake = bridge({
      downloadBundle: () => {
        throw new RangeError('bug')
      },
    })
    await expect(updater(fake, answer('b')).check(true)).rejects.toThrow('bug')
  })

  it('runs one check at a time', async () => {
    let finish = () => {}
    const fake = bridge({ downloadBundle: () => new Promise<void>((resolve) => (finish = resolve)) })
    const live = updater(fake, answer('b'))
    const first = live.check(true)
    const second = live.check(false)
    expect(second).toBe(first)
    await vi.waitFor(() => expect(fake.methods()).toContain('downloadBundle'))
    finish()
    await first
    expect(fake.methods().filter((method) => method === 'downloadBundle')).toHaveLength(1)
  })

  it('holds the app at launch for a required release until it reloads into it', async () => {
    const holds: boolean[] = []
    const fake = bridge()
    await updater(fake, answer('b', true), (holding) => void holds.push(holding)).check(true)
    expect(fake.methods().slice(-3)).toEqual(['downloadBundle', 'setNextBundle', 'reload'])
    expect(holds).toEqual([true, false])
  })

  it('lets the app go on at once when a required release is refused, and never reloads', async () => {
    const holds: boolean[] = []
    const fake = bridge({
      setNextBundle: () => {
        throw new Refused('LiveUpdate.setNextBundle refused bundle b')
      },
    })
    await updater(fake, answer('b', true), (holding) => void holds.push(holding)).check(true)
    expect(holds).toEqual([true, false])
    expect(fake.methods()).not.toContain('reload')
  })

  it('lets the app go on when a required download stalls, and then sets it next without reloading under the user', async () => {
    vi.useFakeTimers()
    const holds: boolean[] = []
    let finish = () => {}
    const fake = bridge({ downloadBundle: () => new Promise<void>((resolve) => (finish = resolve)) })
    const done = updater(fake, answer('b', true), (holding) => void holds.push(holding)).check(true)
    await vi.waitFor(() => expect(fake.methods()).toContain('downloadBundle'))
    await vi.advanceTimersByTimeAsync(requiredUpdateTimeoutMs)
    expect(holds).toEqual([true, false])
    finish()
    await done
    expect(fake.methods().slice(-1)).toEqual(['setNextBundle'])
    expect(holds).toEqual([true, false])
  })

  it('never holds the app for a required release on resume', async () => {
    const holds: boolean[] = []
    const fake = bridge()
    await updater(fake, answer('b', true), (holding) => void holds.push(holding)).check(false)
    expect(holds).toEqual([])
    expect(fake.methods()).not.toContain('reload')
    expect(fake.methods()).toContain('setNextBundle')
  })

  it('never asks the plugin for its own files', async () => {
    const fake = bridge({ getCurrentBundle: () => ({ bundleId: 'a' }), getNextBundle: () => ({ bundleId: 'a' }) })
    for (const given of [answer(null), answer(null, true), undefined]) await updater(fake, given).check(true)
    expect(fake.calls.filter(([method]) => ['setNextBundle', 'reset'].includes(method))).toEqual([])
  })
})

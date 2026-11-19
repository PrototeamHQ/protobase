import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '../app/native-auth-fetch'
import { nativeTabBar, nativeTabBarState } from './native-tab-bar'

const bridge = (plugins: string[]) => {
  const listeners = new Map<string, (data: unknown) => void>()
  const remove = vi.fn(async () => undefined)
  const calls: unknown[][] = []
  const native: NativeBridge = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    isPluginAvailable: (name) => plugins.includes(name),
    nativePromise: async (...args) => calls.push(args),
    addListener: (_plugin, event, callback) => {
      listeners.set(event, callback)
      return { remove }
    },
  }
  return { native, calls, remove, fire: (data: unknown, event = 'tap') => listeners.get(event)?.(data) }
}

describe('nativeTabBar', () => {
  it('is there only where the bridge offers ProtobaseTabBar', () => {
    expect(nativeTabBar(bridge(['ProtobaseTabBar']).native)).toBeDefined()
    expect(nativeTabBar(bridge(['ProtobaseAuth', 'Keyboard']).native)).toBeUndefined()
    expect(nativeTabBar(undefined)).toBeUndefined()
  })

  it('sends the whole state each time', async () => {
    const { native, calls } = bridge(['ProtobaseTabBar'])
    await nativeTabBar(native)?.set({ visible: false })
    expect(calls).toEqual([['ProtobaseTabBar', 'set', { visible: false }]])
  })

  it('hands back the height the bar has, and nothing else', async () => {
    const answering = (answer: unknown): NativeBridge => ({ ...bridge(['ProtobaseTabBar']).native, nativePromise: async () => answer })
    expect(await nativeTabBar(answering({ height: 83 }))?.set({ visible: false })).toEqual({ height: 83 })
    expect(await nativeTabBar(answering({ height: -1 }))?.set({ visible: false })).toEqual({})
    expect(await nativeTabBar(answering({}))?.set({ visible: false })).toEqual({})
  })

  it('hands on the index of a tapped tab, and nothing else, until stopped', () => {
    const { native, fire, remove } = bridge(['ProtobaseTabBar'])
    const taps: number[] = []
    const stop = nativeTabBar(native)?.onTap((index) => taps.push(index))
    fire({ index: 2 })
    fire({ index: '1' })
    fire(null)
    stop?.()
    expect(taps).toEqual([2])
    expect(remove).toHaveBeenCalled()
  })

  it('hands on the height the bar tells, and nothing else', () => {
    const { native, fire } = bridge(['ProtobaseTabBar'])
    const heights: number[] = []
    nativeTabBar(native)?.onHeight((height) => heights.push(height))
    fire({ height: 83 }, 'height')
    fire({ height: -1 }, 'height')
    fire({ height: '83' }, 'height')
    fire({ index: 1 }, 'height')
    expect(heights).toEqual([83])
  })
})

describe('nativeTabBarState', () => {
  it('pairs labels with icons and names the current tab', () => {
    expect(nativeTabBarState(['Home', 'More'], ['data:image/png;base64,AA=='], 1)).toEqual({
      visible: true,
      tabs: [
        { label: 'Home', icon: 'data:image/png;base64,AA==' },
        { label: 'More', icon: null },
      ],
      selected: 1,
    })
  })

  it('marks the search tab', () => {
    expect(nativeTabBarState(['Home', 'Search', 'More'], [], 0, 1).tabs).toEqual([
      { label: 'Home', icon: null },
      { label: 'Search', icon: null, search: true },
      { label: 'More', icon: null },
    ])
  })

  it('names no current tab for one it does not have', () => {
    expect(nativeTabBarState(['Home'], [], -1).selected).toBeNull()
    expect(nativeTabBarState(['Home'], [], 3).selected).toBeNull()
  })
})

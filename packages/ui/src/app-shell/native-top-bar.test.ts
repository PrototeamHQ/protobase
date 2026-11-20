import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '../app/native-auth-fetch'
import { nativeTopBar } from './native-top-bar'

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
  return { native, calls, remove, fire: (event: string, data: unknown = {}) => listeners.get(event)?.(data) }
}

describe('nativeTopBar', () => {
  it('is there only where the bridge offers ProtobaseTopBar', () => {
    expect(nativeTopBar(bridge(['ProtobaseTopBar']).native)).toBeDefined()
    expect(nativeTopBar(bridge(['ProtobaseTabBar']).native)).toBeUndefined()
    expect(nativeTopBar(undefined)).toBeUndefined()
  })

  it('sends the whole state each time', async () => {
    const { native, calls } = bridge(['ProtobaseTopBar'])
    const state = { visible: true, title: 'Ada', back: 'Customers', menu: false, search: true, account: { label: 'Account, Ada', text: 'AL' } } as const
    await nativeTopBar(native)?.set(state)
    expect(calls).toEqual([['ProtobaseTopBar', 'set', state]])
  })

  it('hands back the height the bar has, and nothing else', async () => {
    const answering = (answer: unknown): NativeBridge => ({ ...bridge(['ProtobaseTopBar']).native, nativePromise: async () => answer })
    expect(await nativeTopBar(answering({ height: 103 }))?.set({ visible: false })).toEqual({ height: 103 })
    expect(await nativeTopBar(answering({ height: -1 }))?.set({ visible: false })).toEqual({})
    expect(await nativeTopBar(answering(undefined))?.set({ visible: false })).toEqual({})
  })

  it('tells each control tapped, and stops on every one', () => {
    const { native, fire, remove } = bridge(['ProtobaseTopBar'])
    const tap = vi.fn()
    const stop = nativeTopBar(native)!.onTap(tap)
    fire('back')
    fire('account')
    expect(tap.mock.calls).toEqual([['back'], ['account']])
    stop()
    expect(remove).toHaveBeenCalledTimes(4)
  })

  it('tells only a height that is one', () => {
    const { native, fire } = bridge(['ProtobaseTopBar'])
    const told = vi.fn()
    nativeTopBar(native)!.onHeight(told)
    fire('height', { height: 'tall' })
    fire('height', { height: 103 })
    expect(told.mock.calls).toEqual([[103]])
  })
})

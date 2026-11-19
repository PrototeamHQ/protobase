import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '../app/native-auth-fetch'
import { declaredEdgeSwipe, edgeSwipeAction, nativeEdgeSwipe } from './edge-swipe'

const phone = { desktop: false, back: false, bottomBar: false, drawerOpen: false }

describe('edgeSwipeAction', () => {
  it('goes back where the trail has a step back, with or without a bottom bar', () => {
    expect(edgeSwipeAction({ ...phone, back: true })).toBe('back')
    expect(edgeSwipeAction({ ...phone, back: true, bottomBar: true })).toBe('back')
  })

  it('opens the sidebar without a step back or a bottom bar, while the drawer is closed', () => {
    expect(edgeSwipeAction(phone)).toBe('sidebar')
    expect(edgeSwipeAction({ ...phone, drawerOpen: true })).toBe('none')
  })

  it("leaves the edge on a tab's page with a bottom bar, and on a desktop", () => {
    expect(edgeSwipeAction({ ...phone, bottomBar: true })).toBe('none')
    expect(edgeSwipeAction({ ...phone, desktop: true, back: true })).toBe('none')
  })
})

describe('declaredEdgeSwipe', () => {
  it("leaves back to the host app only where the entry behind is the trail's step back, whose snapshot it shows", () => {
    expect(declaredEdgeSwipe('back', { nativeBack: true, behindIsBack: true })).toBe('back')
    expect(declaredEdgeSwipe('back', { nativeBack: true, behindIsBack: false })).toBe('page')
    expect(declaredEdgeSwipe('back', { nativeBack: false, behindIsBack: true })).toBe('page')
  })

  it('declares the sidebar and none as they are', () => {
    expect(declaredEdgeSwipe('sidebar', { nativeBack: true, behindIsBack: false })).toBe('sidebar')
    expect(declaredEdgeSwipe('none', { nativeBack: true, behindIsBack: true })).toBe('none')
  })
})

describe('nativeEdgeSwipe', () => {
  it('is there only where the bridge offers ProtobaseEdgeSwipe, and sends the action', async () => {
    const calls: unknown[][] = []
    const bridge = (plugins: string[]): NativeBridge => ({
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      isPluginAvailable: (name) => plugins.includes(name),
      nativePromise: async (...args) => calls.push(args),
      addListener: () => ({ remove: vi.fn(async () => undefined) }),
    })
    expect(nativeEdgeSwipe(bridge([]))).toBeUndefined()
    await nativeEdgeSwipe(bridge(['ProtobaseEdgeSwipe']))?.set('back')
    expect(calls).toEqual([['ProtobaseEdgeSwipe', 'set', { action: 'back' }]])
  })
})

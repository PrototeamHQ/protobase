import { describe, expect, it, vi } from 'vitest'
import type { LiveHandlers } from './live'
import { sharedLive } from './shared-live'

describe('sharedLive', () => {
  it('follows one stream for every subscriber, hands each every event, and stops it after the last one', () => {
    let upstream: LiveHandlers | undefined
    const stop = vi.fn()
    const follow = vi.fn((handlers: LiveHandlers) => {
      upstream = handlers
      return stop
    })
    const live = sharedLive(follow)
    const heard: string[] = []
    const handlers = (name: string): LiveHandlers => ({ onChanges: () => heard.push(`${name} changes`), onResync: () => heard.push(`${name} resync`) })
    const subscribers = Array.from({ length: 7 }, (_, n) => live(handlers(String(n))))
    expect(follow).toHaveBeenCalledTimes(1)

    upstream!.onChanges([{ resource: 'rooms', key: '1', operation: 'update' }])
    upstream!.onResync()
    expect(heard).toHaveLength(14)
    for (const unsubscribe of subscribers.slice(1)) unsubscribe()
    subscribers[1]!()
    expect(stop).not.toHaveBeenCalled()
    subscribers[0]!()
    expect(stop).toHaveBeenCalledTimes(1)

    live(handlers('again'))
    expect(follow).toHaveBeenCalledTimes(2)
  })
})

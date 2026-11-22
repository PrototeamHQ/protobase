import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@protobase/client'
import { createPresenceStore } from '../presence/presence'
import { followPresence } from './follow-presence'
import { createRelayStore } from './relay-store'

const fields = { resource: 'presences', user: 'user_id', status: 'status', at: 'since' }
const at = (second: number) => `2026-11-21T10:00:0${second}.000Z`

const setup = (items: Array<Record<string, unknown>>) => {
  const list = vi.fn(async () => ({ items }))
  const client = { list } as unknown as Client
  const presence = createPresenceStore()
  const relay = createRelayStore()
  return { list, presence, relay, stop: followPresence(client, fields, presence, relay) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('followPresence', () => {
  it('reads the people the page shows in one request, then only those it shows anew', async () => {
    const { list, presence } = setup([{ user_id: 'u1', status: 'away', since: at(1) }])
    presence.show(['u1', 'u2'])
    presence.show(['u1'])
    await flush()
    expect(list).toHaveBeenCalledWith('presences', { filter: 'in(user_id, "u1", "u2")', pageSize: 2, fields: ['user_id', 'status', 'since'] })
    expect(presence.get()).toEqual({ u1: 'away' })
    presence.show(['u3'])
    await flush()
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith('presences', { filter: 'in(user_id, "u3")', pageSize: 1, fields: ['user_id', 'status', 'since'] })
  })

  it('applies presence_changed on people, but not one that began earlier or another event', async () => {
    const { presence, relay } = setup([{ user_id: 'u1', status: 'online', since: at(2) }])
    presence.show(['u1'])
    await flush()
    relay.handlers.onPublished!({ channel: 'people', event: 'presence_changed', payload: { user: 'u1', status: 'offline', at: at(1) } })
    relay.handlers.onPublished!({ channel: 'conversations/7', event: 'presence_changed', payload: { user: 'u1', status: 'offline', at: at(3) } })
    expect(presence.get()).toEqual({ u1: 'online' })
    relay.handlers.onPublished!({ channel: 'people', event: 'presence_changed', payload: { user: 'u1', status: 'offline', at: at(3) } })
    expect(presence.get()).toEqual({ u1: 'offline' })
  })

  it('reads everyone shown again after the relay reconnects, and shows none once stopped', async () => {
    const { list, presence, relay, stop } = setup([])
    presence.show(['u1', 'u2'])
    await flush()
    relay.handlers.onResync!()
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith('presences', { filter: 'in(user_id, "u1", "u2")', pageSize: 2, fields: ['user_id', 'status', 'since'] })
    relay.handlers.onPublished!({ channel: 'people', event: 'presence_changed', payload: { user: 'u1', status: 'online', at: at(1) } })
    stop()
    expect(presence.get()).toBeUndefined()
  })
})

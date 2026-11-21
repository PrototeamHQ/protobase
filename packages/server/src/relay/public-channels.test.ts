import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { buildRegistry } from '../registry'
import { publicChannels, type AnonymousReadable } from './public-channels'

const registry = buildRegistry([
  resource('rooms').table('rooms').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id),
  resource('boards').table('boards').fields({ id: f.text(), name: f.text() }).primaryKey((r) => r.id),
])

// Reads as the anonymous role would, from the readable keys of each resource, and keeps each call.
const reading = (readable: Record<string, string[]>) => {
  const calls: Array<{ resource: string; keys: unknown[] }> = []
  const read: AnonymousReadable = async (entry, keys) => {
    calls.push({ resource: entry.name, keys })
    return new Set((readable[entry.name] ?? []).map((key) => JSON.stringify([key])))
  }
  return { read, calls }
}

describe('publicChannels', () => {
  it('reads each resource once, and keeps the channels whose records are readable', async () => {
    const { read, calls } = reading({ rooms: ['1'], boards: ['b'] })
    expect(await publicChannels(registry, read, ['rooms/1', 'rooms/2', 'boards/b', 'boards/c'])).toEqual(new Set(['rooms/1', 'boards/b']))
    expect(calls).toEqual([{ resource: 'rooms', keys: [[1], [2]] }, { resource: 'boards', keys: [['b'], ['c']] }])
  })

  it('takes a record the read leaves out as not public', async () => {
    const { read } = reading({})
    expect(await publicChannels(registry, read, ['rooms/1'])).toEqual(new Set())
  })

  it('takes a name that is not its record\'s own, or names none, as not public without reading it', async () => {
    const { read, calls } = reading({ rooms: ['1'] })
    expect(await publicChannels(registry, read, ['rooms/01', 'rooms/x', 'nothing/1', 'rooms'])).toEqual(new Set())
    expect(calls).toEqual([])
  })

  it('fails with the read', async () => {
    const read: AnonymousReadable = async () => {
      throw new Error('canceling statement due to statement timeout')
    }
    await expect(publicChannels(registry, read, ['rooms/1'])).rejects.toThrow('statement timeout')
  })
})

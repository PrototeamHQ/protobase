import { describe, expect, it } from 'vitest'
import { ApiError, PreconditionFailedError } from '@protobase/client'
import { moveReadPosition, type PositionStore, type SavedPosition } from './read-position-write'

// One stored position, written only over its current version, as the API does with If-Match
const fakeStore = (initial?: SavedPosition) => {
  let current = initial
  let version = 0
  const writes: number[] = []
  const store: PositionStore = {
    find: async () => current,
    create: async (lastRead) => {
      if (current) throw new ApiError({ type: 'conflict', title: 'Conflict', status: 409 })
      current = { key: '1', lastRead, etag: `v${++version}` }
      writes.push(lastRead)
      return current
    },
    update: async (at, lastRead) => {
      if (!current || at.etag !== current.etag) throw new PreconditionFailedError({ type: 'precondition-failed', title: 'Precondition Failed', status: 412 })
      current = { ...current, lastRead, etag: `v${++version}` }
      writes.push(lastRead)
      return current
    },
  }
  // Another tab moving the position on
  const elsewhere = (lastRead: number) => {
    current = { key: '1', lastRead, etag: `v${++version}` }
  }
  return { store, writes, elsewhere, stored: () => current }
}

describe('moveReadPosition', () => {
  it('creates the position, then moves it up, and writes nothing for a move to where it is or below', async () => {
    const { store, writes } = fakeStore()
    const made = await moveReadPosition(store, undefined, 10)
    const moved = await moveReadPosition(store, made, 12)
    expect(await moveReadPosition(store, moved, 11)).toBe(moved)
    expect(writes).toEqual([10, 12])
  })

  it('never lowers a position another tab moved further', async () => {
    const { store, writes, elsewhere, stored } = fakeStore()
    const made = await moveReadPosition(store, undefined, 10)
    elsewhere(20)
    expect(await moveReadPosition(store, made, 15)).toEqual({ key: '1', lastRead: 20, etag: 'v2' })
    expect(stored()?.lastRead).toBe(20)
    expect(writes).toEqual([10])
  })

  it('moves past a position another tab moved less far', async () => {
    const { store, elsewhere, stored } = fakeStore()
    const made = await moveReadPosition(store, undefined, 10)
    elsewhere(12)
    await moveReadPosition(store, made, 15)
    expect(stored()?.lastRead).toBe(15)
  })

  it('keeps the higher position when another tab created it first', async () => {
    const higher = fakeStore({ key: '1', lastRead: 20, etag: 'v0' })
    expect((await moveReadPosition(higher.store, undefined, 15)).lastRead).toBe(20)
    expect(higher.writes).toEqual([])
    const lower = fakeStore({ key: '1', lastRead: 5, etag: 'v0' })
    expect((await moveReadPosition(lower.store, undefined, 15)).lastRead).toBe(15)
  })

  it('passes on any other refusal', async () => {
    const { store } = fakeStore()
    const refused = new ApiError({ type: 'forbidden', title: 'Forbidden', status: 403 })
    await expect(moveReadPosition({ ...store, create: () => Promise.reject(refused) }, undefined, 10)).rejects.toBe(refused)
  })
})

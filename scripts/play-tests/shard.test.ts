import { describe, expect, it } from 'vitest'
import { parseShard, shardOf } from './shard.mjs'

const stories = Array.from({ length: 7 }, (_, i) => `story-${i}`)

describe('shardOf', () => {
  it('puts every story in exactly one shard, the shards differing in size by at most one', () => {
    const shards = [1, 2, 3].map((index) => shardOf(stories, { index, count: 3 }))
    expect(shards.flat().toSorted()).toEqual(stories.toSorted())
    expect(new Set(shards.flat()).size).toBe(stories.length)
    expect(shards.map((shard) => shard.length)).toEqual([3, 2, 2])
  })

  it('keeps the full order in each shard, and the same stories give the same shards', () => {
    expect(shardOf(stories, { index: 1, count: 2 })).toEqual(['story-0', 'story-2', 'story-4', 'story-6'])
    expect(shardOf(stories, { index: 2, count: 2 })).toEqual(['story-1', 'story-3', 'story-5'])
    expect(shardOf([...stories], { index: 2, count: 2 })).toEqual(shardOf(stories, { index: 2, count: 2 }))
  })

  it('plays every story with a count of 1 or no shard', () => {
    expect(shardOf(stories, { index: 1, count: 1 })).toEqual(stories)
    expect(shardOf(stories, undefined)).toEqual(stories)
  })
})

describe('parseShard', () => {
  it('reads --shard <index>/<count>, or nothing without it', () => {
    expect(parseShard(['--shard', '2/2'])).toEqual({ index: 2, count: 2 })
    expect(parseShard([])).toBeUndefined()
  })

  it('stops on an index outside the count, a count below 1 or a malformed value, naming it', () => {
    expect(() => parseShard(['--shard', '3/2'])).toThrow('--shard 3/2: the index must be from 1 to 2')
    expect(() => parseShard(['--shard', '0/2'])).toThrow('--shard 0/2: the index must be from 1 to 2')
    expect(() => parseShard(['--shard', '1/0'])).toThrow('--shard 1/0: the count must be at least 1')
    expect(() => parseShard(['--shard', 'two'])).toThrow('not "two"')
    expect(() => parseShard(['--shard'])).toThrow('not undefined')
  })
})

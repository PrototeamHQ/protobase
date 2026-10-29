// The part of the play stories one CI leg plays: `--shard <index>/<count>`, with the index from 1, takes every
// count-th story from the index-th on, so the shards differ in size by at most one, each keeps the stories' order, and
// the same stories always give the same shards. Without the argument every story plays.

// { index, count } from the process's arguments, or undefined when no shard is given.
export const parseShard = (argv) => {
  const at = argv.indexOf('--shard')
  if (at === -1) return
  const value = argv[at + 1]
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '')
  if (!match) throw new Error(`--shard takes <index>/<count>, such as 1/2, not ${JSON.stringify(value)}`)
  const index = Number(match[1])
  const count = Number(match[2])
  if (count < 1) throw new Error(`--shard ${value}: the count must be at least 1`)
  if (index < 1 || index > count) throw new Error(`--shard ${value}: the index must be from 1 to ${count}`)
  return { index, count }
}

export const shardOf = (stories, shard) => {
  if (!shard) return stories
  return stories.filter((_, i) => i % shard.count === shard.index - 1)
}

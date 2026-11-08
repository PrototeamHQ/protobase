/** The stretch of an ordered list a `reorder` numbers: the records `first` to `last`, valued `start`, `start` + 1, ... */
export type ReorderSpan = { first: number; last: number; start: number }

const isRank = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

/**
 * The shortest stretch that saves a move: `ranks` are the records' values in their new order, and `first` to `last`
 * the places that moved. The records before it keep their values, so they must already rise, and the stretch starts
 * just above them, or at 1; it then reaches on until the next record already ranks above it. When the values were
 * 1, 2, 3, ... that is the records that moved and nothing else, so a long list sends a few keys instead of all of them.
 */
export const reorderSpan = (ranks: readonly unknown[], first: number, last: number): ReorderSpan => {
  // How far from the start the values rise, and from where they rise to the end
  let rising = 0
  while (rising < first && isRank(ranks[rising]) && (rising === 0 || (ranks[rising] as number) > (ranks[rising - 1] as number))) rising += 1
  let tail = ranks.length
  while (tail - 1 > last && isRank(ranks[tail - 1]) && (tail === ranks.length || (ranks[tail - 1] as number) < (ranks[tail] as number))) tail -= 1

  const from = Math.min(first, rising)
  const start = from === 0 ? 1 : (ranks[from - 1] as number) + 1
  let to = Math.max(last, tail - 1)
  while (to + 1 < ranks.length && (ranks[to + 1] as number) <= start + (to - from)) to += 1
  return { first: from, last: to, start }
}

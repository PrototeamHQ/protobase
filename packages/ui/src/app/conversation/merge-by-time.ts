/** A list a thread reads newest first, a page at a time: the items loaded so far, and whether earlier ones are left. */
export type TimedList<T> = { items: T[]; more: boolean }

// An item without a time sorts as the newest, as Postgres puts a null first when ordering newest first
const timeOf = (time: string | undefined) => (time === undefined ? Infinity : Date.parse(time))

/**
 * Two lists read newest first, such as a thread's messages and its tool calls, as one newest first. Items older than
 * the oldest loaded of a list with earlier ones left are held back until those load, so nothing shows out of order. At
 * the same time, an item of `first` is newer than one of `second`, so the one of `second` shows before it.
 */
export const mergeByTime = <A extends { time: string | undefined }, B extends { time: string | undefined }>(first: TimedList<A>, second: TimedList<B>): (A | B)[] => {
  const oldest = (list: TimedList<{ time: string | undefined }>) => (list.more && list.items.length > 0 ? timeOf(list.items.at(-1)!.time) : -Infinity)
  const cutoff = Math.max(oldest(first), oldest(second))
  const merged: (A | B)[] = []
  let a = 0
  let b = 0
  while (a < first.items.length || b < second.items.length) {
    const takeFirst = b >= second.items.length || (a < first.items.length && timeOf(first.items[a]!.time) >= timeOf(second.items[b]!.time))
    const item = takeFirst ? first.items[a++]! : second.items[b++]!
    if (timeOf(item.time) < cutoff) break
    merged.push(item)
  }
  return merged
}

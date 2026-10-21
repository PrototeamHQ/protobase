/** `run` over `items`, at most `limit` at a time, giving the results in the items' order. */
export const inParallel = async <T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Joins calls of one key that overlap: the second waits for the first's result instead of starting its own, such as a
 * second refresh of one account's token. An entry lives only while its call runs, so the map holds the calls in flight.
 */
export const singleFlight = <T>() => {
  const running = new Map<string, Promise<T>>()
  return (key: string, call: () => Promise<T>) => {
    const joined = running.get(key)
    if (joined) return joined
    const started = call().finally(() => running.delete(key))
    running.set(key, started)
    return started
  }
}

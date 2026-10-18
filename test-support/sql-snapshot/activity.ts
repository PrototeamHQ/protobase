// The queries waiting for or holding a snapshot database's connection, so a test can wait until work it started in the
// background, such as Better Auth's schema check after createAuth, is done: otherwise it would run into the next test,
// at one point when recording and at another when replaying.

let busy = 0
let started = 0
let idle: (() => void)[] = []

/** Counts `work` as a query in progress until it settles. */
export const track = async <T>(work: () => Promise<T>) => {
  busy++
  started++
  try {
    return await work()
  } finally {
    busy--
    if (busy === 0) for (const resolve of idle.splice(0)) resolve()
  }
}

const turn = () => new Promise((resolve) => setImmediate(resolve))
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Waits until no query is in progress and none starts for a few turns of the event loop and then 10 ms: Better Auth
 * starts its schema check once its context is set up, which takes a few event loop turns of crypto and imports.
 */
export const settle = async (seconds = 10) => {
  const deadline = performance.now() + seconds * 1000
  for (;;) {
    const before = started
    if (busy > 0) await new Promise<void>((resolve) => idle.push(resolve))
    for (let i = 0; i < 5; i++) await turn()
    await pause(10)
    if (busy === 0 && started === before) return
    if (performance.now() > deadline) throw new Error(`Queries kept running in the background for ${seconds} s; a snapshot test cannot replay that`)
  }
}

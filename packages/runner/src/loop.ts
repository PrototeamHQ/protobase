import { buildKind, jobKind, type RunnerState } from '@protobase/workflows'
import { AppRefusal, type AppClient } from './app'
import { builder } from './builds'
import type { Settings } from './config'
import { appKey, type Engine, type Identity } from './engine'
import { runJob } from './job'

/** The platform the runner says it is: `linux/amd64` or `linux/arm64`. */
export const platform = (arch = process.arch) => `linux/${arch === 'x64' ? 'amd64' : arch}`

/** The kinds of steps the runner says it runs: containers, and builds when it builds images. */
export const kinds = (settings: Pick<Settings, 'build'>) => [jobKind, ...(settings.build ? [buildKind] : [])]

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })

// How long the runner waits before it claims again after a claim failed: longer each time, at most a minute.
const backoffMs = (failures: number) => Math.min(60_000, 1000 * 2 ** Math.min(failures, 6))

export type LoopInput = { app: AppClient; engine: Engine; settings: Settings; identity: Identity; say: (line: string) => void; signal: AbortSignal }

// How long the runner waits, as it stops, for its jobs and builds to end and clean up, a job's cleanup's 60 seconds
// included.
export const shutdownMs = 90_000

/**
 * The runner's loop: while it has a free slot it holds a claim open with what it says of itself (its platform, kinds,
 * free slots and the step versions whose images it has, by their labels), and runs each job it is given beside the
 * others, up to its slots. A `prepare` order builds that step's image, unless it is here, before it claims again. A
 * claim that fails is made again after a pause; one refused as unauthorized, as when the runner was revoked, ends the
 * loop. Once `signal` aborts, or the loop ends for any other reason, it claims no more, stops the jobs and the build it
 * runs, and waits for them to clean up, up to `shutdownMs`, before it ends.
 */
export const runLoop = async ({ app, engine, settings, identity, say, signal, waitMs = shutdownMs }: LoopInput & { waitMs?: number }) => {
  // Stops everything the loop started, as the runner stops or the loop ends otherwise.
  const halt = new AbortController()
  const halting = () => halt.abort()
  signal.addEventListener('abort', halting, { once: true })
  if (signal.aborted) halt.abort()
  const stop = halt.signal
  const build = builder({ app, engine, settings, identity, say, signal: stop })
  const running = new Set<Promise<void>>()
  const stopped = new Promise((resolve) => stop.addEventListener('abort', resolve, { once: true }))
  let failures = 0
  try {
    while (!stop.aborted) {
      if (running.size >= settings.slots) {
        await Promise.race([...running, stopped])
        continue
      }
      let order
      try {
        const state: RunnerState = { platform: platform(), kinds: kinds(settings), labels: [], capacity: { slots: settings.slots - running.size }, images: (await engine.images(appKey(identity))).map((step) => ({ step })), instances: [] }
        order = await app.claim(state, stop)
        failures = 0
      } catch (error) {
        if (stop.aborted) break
        if (error instanceof AppRefusal && error.status === 401) throw new Error(`The app refused the runner's token, as after it was revoked or deleted: register it again (${error.message})`)
        failures++
        say(`claim failed, trying again: ${error instanceof Error ? error.message : String(error)}`)
        await pause(backoffMs(failures), stop)
        continue
      }
      if (order.order === 'job') {
        const job = runJob({ app, engine, build, settings, identity, say }, order.job, stop).catch((error: unknown) => say(`job ${order.job.id}: ${String(error)}`))
        const tracked = job.finally(() => running.delete(tracked))
        running.add(tracked)
      } else if (order.order === 'prepare') {
        say(`prepare ${order.step}`)
        // A build that cannot even start, as on a full disk, is said and waited out; the loop goes on claiming.
        try {
          await build(order.step, order.build)
        } catch (error) {
          failures++
          say(`prepare ${order.step} failed, claiming again after a pause: ${error instanceof Error ? error.message : String(error)}`)
          await pause(backoffMs(failures), stop)
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', halting)
    halt.abort()
    if (running.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const ended = await Promise.race([Promise.allSettled(running).then(() => true), new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), waitMs)))])
      clearTimeout(timer)
      if (!ended) say(`stopped waiting for ${running.size} ${running.size === 1 ? 'job' : 'jobs'} to clean up after ${waitMs / 1000} seconds`)
    }
  }
}
